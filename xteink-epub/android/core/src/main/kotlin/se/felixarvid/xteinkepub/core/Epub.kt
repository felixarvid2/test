package se.felixarvid.xteinkepub.core

import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import se.felixarvid.xteinkepub.core.Xml.attrOrNull
import se.felixarvid.xteinkepub.core.Xml.childElement
import se.felixarvid.xteinkepub.core.Xml.childElements
import se.felixarvid.xteinkepub.core.Xml.descendants
import se.felixarvid.xteinkepub.core.Xml.localName
import se.felixarvid.xteinkepub.core.Xml.prefix
import java.io.File
import java.io.OutputStream
import java.util.concurrent.CancellationException

private val FONT_OBFUSCATION = setOf(
    "http://www.idpf.org/2008/embedding",
    "http://ns.adobe.com/pdf/enc#RC",
)
private val XHTML_TYPES = setOf("application/xhtml+xml", "text/html")
private val RASTER_TYPES = setOf(
    "image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/gif",
    "image/webp", "image/bmp", "image/x-ms-bmp", "image/tiff",
)
private val JUNK_NAMES = setOf(
    ".ds_store", "thumbs.db", "desktop.ini", "itunesmetadata.plist",
    "itunesartwork", "calibre_bookmarks.txt",
)
private val FONT_EXTS = listOf(".ttf", ".otf", ".woff", ".woff2")
private val MIMETYPE = "application/epub+zip".toByteArray(Charsets.US_ASCII)
private const val ENC_NAME = "META-INF/encryption.xml"

private fun isFont(mediaType: String?, path: String): Boolean {
    val mt = (mediaType ?: "").lowercase()
    return mt.startsWith("font/") || mt.startsWith("application/font-") || mt.startsWith("application/x-font-") ||
        mt == "application/vnd.ms-opentype" || FONT_EXTS.any { path.lowercase().endsWith(it) }
}

private fun checkDrm(source: ZipSource) {
    if (source.contains("META-INF/rights.xml")) {
        throw DrmException("Boken är DRM-skyddad (rights.xml finns). DRM måste tas bort först.")
    }
    if (!source.contains(ENC_NAME)) return
    val doc = try {
        Xml.parse(source.read(ENC_NAME))
    } catch (e: XmlParseException) {
        return
    }
    for (data in doc.descendants("EncryptedData")) {
        val algo = data.childElement("EncryptionMethod")?.attrOrNull("Algorithm")
        if (algo !in FONT_OBFUSCATION) {
            throw DrmException("Boken är DRM-skyddad (krypterat innehåll i encryption.xml). DRM måste tas bort först.")
        }
    }
}

private fun findOpf(source: ZipSource): String {
    if (source.contains("META-INF/container.xml")) {
        try {
            val root = Xml.parse(source.read("META-INF/container.xml"))
            for (rf in root.descendants("rootfile")) {
                val path = rf.attrOrNull("full-path")
                if (!path.isNullOrEmpty() && source.contains(path)) return path
            }
        } catch (e: XmlParseException) {
            // fall through to the search below
        }
    }
    return source.names.firstOrNull { it.lowercase().endsWith(".opf") } ?: throw NoOpfException()
}

/** Remove [el] and the whitespace that followed it (lxml's remove() drops the tail too). */
private fun removeWithBlankTail(el: Element) {
    val next = el.nextSibling()
    if (next is org.jsoup.nodes.TextNode && next.isBlank) next.remove()
    el.remove()
}

/** Mutable in-memory book plus the steps of the pipeline (port of the Book class in epub.py). */
private class Book(
    val source: ZipSource,
    val opts: ConvertOptions,
    val images: ImageProcessor,
    val progress: ProgressListener?,
    val report: ConversionReport,
) {
    private val modified = HashMap<String, ByteArray>()
    private val deleted = HashSet<String>()
    private val renames = HashMap<String, String>()
    private val names: Set<String> = source.names.toSet()
    val opfPath: String = findOpf(source)
    val opf: Document
    private var opfChanged = false
    val manifest: Element
    var items: MutableList<Pair<Element, String?>>
    private var rewriter = RefRewriter(emptyMap())
    private var removedFonts: Set<String> = emptySet()
    private var removedCss: Set<String> = emptySet()
    private val unwrapped = ArrayList<Element>()

    init {
        opf = try {
            Xml.parse(source.read(opfPath))
        } catch (e: XmlParseException) {
            throw InvalidOpfException("Kunde inte tolka OPF-filen ($opfPath).")
        }
        val root = opf.firstElementChild()
        if (root == null || root.localName() != "package") throw InvalidOpfException("OPF-filen saknar <package>-element.")
        manifest = root.childElement("manifest") ?: throw InvalidOpfException("OPF-filen saknar <manifest>.")
        items = manifest.childElements("item").map { it to resolveRef(it.attrOrNull("href"), opfPath) }.toMutableList()
    }

    private val pkg: Element get() = opf.firstElementChild()!!

    private fun has(path: String) = path in names
    private fun read(path: String): ByteArray = modified[path] ?: source.read(path)
    private fun warn(msg: String) { report.warnings.add(msg) }
    private fun delete(path: String) { deleted.add(path) }
    private fun mediaType(it: Element) = it.attr("media-type").lowercase()

    private fun report(stage: Stage, fraction: Float, index: Int = 0, count: Int = 0, name: String? = null) {
        progress?.onProgress(Progress(stage, fraction.coerceIn(0f, 1f), index, count, name))
    }

    // ---------------------------------------------------------------- images
    fun convertImages() {
        val imageOpts = opts.imageOptions()
        val taken = names.mapTo(HashSet()) { it.lowercase() }
        val mapping = HashMap<String, String>()
        val done = HashSet<String>()
        val converted = HashSet<String>()
        val todo = items.filter { (it, path) -> mediaType(it) in RASTER_TYPES && path != null }
            .mapNotNull { it.second }.distinct()
        var index = 0
        for ((it, itemPath) in items) {
            val path = itemPath ?: continue
            if (mediaType(it) !in RASTER_TYPES || !done.add(path)) continue
            index++
            report(Stage.IMAGES, 0.02f + 0.78f * (index - 1) / maxOf(1, todo.size), index, todo.size, path)
            if (!has(path)) {
                warn("Bild saknas i arkivet: $path")
                continue
            }
            val before = try {
                read(path)
            } catch (e: java.io.IOException) {
                report.imagesFailed++
                warn("Kunde inte läsa bilden $path (${e.message}), lämnas orörd")
                continue
            }
            val result: ByteArray? = try {
                images.process(before, imageOpts)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                report.imagesFailed++
                warn("Kunde inte konvertera bilden $path (${e.message ?: e.javaClass.simpleName}), lämnas orörd")
                continue
            } catch (e: OutOfMemoryError) {
                report.imagesFailed++
                warn("Kunde inte konvertera bilden $path (för stor för minnet), lämnas orörd")
                continue
            }
            if (result == null) {
                report.imagesFailed++
                warn("Kunde inte konvertera bilden $path (kunde inte avkodas), lämnas orörd")
                continue
            }
            modified[path] = result
            converted.add(path)
            report.imagesConverted++
            var newPath = path
            if (!path.lowercase().endsWith(".jpg") && !path.lowercase().endsWith(".jpeg")) {
                val stem = splitExt(path).first
                newPath = "$stem.jpg"
                var n = 1
                while (newPath.lowercase() in taken) {
                    newPath = "${stem}_$n.jpg"
                    n++
                }
                taken.add(newPath.lowercase())
                mapping[path] = newPath
                renames[path] = newPath
            }
            report.notes.add("bild: $newPath ${before.size} -> ${result.size} byte")
        }
        // manifest: every item pointing at a converted image is now a JPEG
        for ((it, path) in items) {
            if (path in converted) {
                it.attr("media-type", "image/jpeg")
                opfChanged = true
            }
        }
        rewriter = RefRewriter(mapping)
    }

    // ----------------------------------------------------------------- fonts
    fun removeFonts() {
        report(Stage.FONTS, 0.80f)
        val removed = HashSet<String>()
        for (pair in items.toList()) {
            val (it, path) = pair
            if (path != null && isFont(it.attrOrNull("media-type"), path)) {
                removed.add(path)
                removeWithBlankTail(it)
                items.remove(pair)
                opfChanged = true
                if (has(path)) {
                    delete(path)
                    report.fontsRemoved++
                }
            }
        }
        removedFonts = removed
        if (removed.isNotEmpty() && has(ENC_NAME)) {
            val doc = try {
                Xml.parse(read(ENC_NAME))
            } catch (e: XmlParseException) {
                return
            }
            for (data in doc.descendants("EncryptedData")) {
                val uri = data.descendants("CipherReference").firstOrNull()?.attrOrNull("URI")
                if (!uri.isNullOrEmpty() && resolveRef(uri, "mimetype") in removed) data.remove()
            }
            if (doc.descendants("EncryptedData").isEmpty()) delete(ENC_NAME)
            else modified[ENC_NAME] = Xml.serialize(doc)
        }
    }

    fun removeStylesheets() {
        val removed = HashSet<String>()
        for (pair in items.toList()) {
            val (it, path) = pair
            if (path != null && mediaType(it) == "text/css") {
                removed.add(path)
                removeWithBlankTail(it)
                items.remove(pair)
                opfChanged = true
                if (has(path)) {
                    delete(path)
                    report.cssRemoved++
                }
            }
        }
        removedCss = removed
    }

    // ----------------------------------------------------------- file passes
    fun processFiles() {
        val removedAll = removedFonts + removedCss
        val xopts = Xhtml.Options(
            rewrite = rewriter, removedPaths = removedAll,
            removeFonts = !opts.keepFonts,
            simplifyCss = !opts.keepCss && !opts.stripCss,
            stripCss = opts.stripCss,
        )
        val cssBase = Css.Options(removeFonts = !opts.keepFonts, simplify = !opts.keepCss)
        val done = HashSet<String>()
        val todo = items.count { (_, p) -> p != null && has(p) && p !in deleted }
        var index = 0
        for ((it, path) in items) {
            if (path == null || !has(path) || path in deleted || !done.add(path)) continue
            index++
            report(Stage.PAGES, 0.80f + 0.15f * (index - 1) / maxOf(1, todo), index, todo, path)
            when (val mt = mediaType(it)) {
                in XHTML_TYPES -> {
                    val res = Xhtml.process(read(path), path, xopts)
                    report.warnings.addAll(res.warnings)
                    report.fontFacesRemoved += res.fontFacesRemoved
                    res.data?.let { d -> modified[path] = d }
                    if (res.svgUnwrapped) {
                        report.svgUnwrapped++
                        if (!res.hasSvg) unwrapped.add(it)
                    }
                }
                "text/css" -> processCss(path, cssBase)
                "application/x-dtbncx+xml", "image/svg+xml" -> rewriteXmlFile(path)
                else -> if (mt.isEmpty()) Unit
            }
        }
    }

    private fun processCss(path: String, base: Css.Options) {
        val raw = read(path)
        val text = decodeCss(raw)
        val rw = rewriter
        val o = base.withRewriter { u -> rw.rewrite(u, path) }
        val (new, stats) = Css.processStylesheet(text, o)
        report.fontFacesRemoved += stats.fontFacesRemoved
        if (stats.changes > 0) modified[path] = new.toByteArray(Charsets.UTF_8)
    }

    private fun decodeCss(raw: ByteArray): String {
        var start = 0
        if (raw.size >= 3 && raw[0] == 0xEF.toByte() && raw[1] == 0xBB.toByte() && raw[2] == 0xBF.toByte()) start = 3
        return try {
            Charsets.UTF_8.newDecoder()
                .onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
                .onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT)
                .decode(java.nio.ByteBuffer.wrap(raw, start, raw.size - start)).toString()
        } catch (e: java.nio.charset.CharacterCodingException) {
            String(raw, Charsets.ISO_8859_1)
        }
    }

    private fun rewriteXmlFile(path: String) {
        val doc = try {
            Xml.parse(read(path))
        } catch (e: XmlParseException) {
            warn("$path: kunde inte tolkas, lämnas orörd")
            return
        }
        if (Xhtml.rewriteXmlRefs(doc, path, rewriter) > 0) modified[path] = Xml.serialize(doc)
    }

    // ------------------------------------------------------------------- OPF
    fun finishOpf() {
        if (Xhtml.rewriteXmlRefs(opf, opfPath, rewriter) > 0) opfChanged = true
        // an unwrapped svg page no longer needs the svg property
        val spine = pkg.childElement("spine")
        for (it in unwrapped) {
            dropToken(it, "properties", "svg")
            if (spine != null) {
                for (ref in spine.childElements("itemref")) {
                    if (ref.attr("idref") == it.attr("id")) dropToken(ref, "properties", "svg")
                }
            }
        }
        ensureCover()
        if (opfChanged) modified[opfPath] = Xml.serialize(opf)
    }

    private fun dropToken(el: Element, attr: String, token: String) {
        val tokens = el.attr(attr).split(Regex("\\s+")).filter { it.isNotEmpty() }.toMutableList()
        if (token !in tokens) return
        tokens.remove(token)
        if (tokens.isNotEmpty()) el.attr(attr, tokens.joinToString(" ")) else el.removeAttr(attr)
        opfChanged = true
    }

    /** The zip path an item points to now (after image renames). */
    private fun currentPath(p: String?) = if (p == null) null else renames[p] ?: p

    private fun itemForPath(path: String?): Element? =
        if (path == null) null else items.firstOrNull { (_, p) -> p == path || currentPath(p) == path }?.first

    private fun findCover(): Element? {
        fun isImage(it: Element) = it.attr("media-type").lowercase().startsWith("image/")
        for ((it, _) in items) {
            if ("cover-image" in it.attr("properties").split(Regex("\\s+"))) return it
        }
        val metadata = pkg.childElement("metadata")
        if (metadata != null) {
            for (meta in metadata.childElements("meta")) {
                if (meta.attr("name").lowercase() == "cover") {
                    val it = items.firstOrNull { (i, _) -> i.attr("id") == meta.attr("content") }?.first
                    if (it != null && isImage(it)) return it
                }
            }
        }
        val guide = pkg.childElement("guide")
        if (guide != null) {
            for (ref in guide.childElements("reference")) {
                if (ref.attr("type").lowercase() == "cover") {
                    val it = itemForPath(resolveRef(ref.attrOrNull("href"), opfPath))
                    if (it != null && isImage(it)) return it
                }
            }
        }
        val candidates = items.filter { (it, p) ->
            isImage(it) && "cover" in (it.attr("id") + " " + (p ?: "")).lowercase()
        }.map { it.first }
        for (it in candidates) {
            if (it.attr("id").lowercase() in setOf("cover", "cover-image", "coverimage")) return it
        }
        return candidates.firstOrNull()
    }

    private fun ensureCover() {
        val cover = findCover()
        val metadata = pkg.childElement("metadata")
        if (cover == null || metadata == null || cover.attr("id").isEmpty()) return
        val cid = cover.attr("id")
        val metas = metadata.childElements("meta").filter { it.attr("name").lowercase() == "cover" }
        if (metas.isEmpty()) {
            val meta = Element(metadata.prefix() + "meta")
            meta.attr("name", "cover")
            meta.attr("content", cid)
            metadata.appendChild(meta)
            opfChanged = true
        } else {
            for (m in metas) {
                if (m.attr("content") != cid) {
                    m.attr("content", cid)
                    opfChanged = true
                }
            }
        }
        val version = pkg.attrOrNull("version").takeUnless { it.isNullOrEmpty() } ?: "2.0"
        if (version.startsWith("3")) {
            val props = cover.attr("properties").split(Regex("\\s+")).filter { it.isNotEmpty() }
            if ("cover-image" !in props) {
                cover.attr("properties", (props + "cover-image").joinToString(" "))
                opfChanged = true
            }
        }
    }

    // ------------------------------------------------------------------ junk
    fun removeJunk() {
        val manifestPaths = items.mapNotNullTo(HashSet()) { it.second }
        for (name in source.names) {
            if (name in manifestPaths || name in deleted) continue
            val parts = name.split("/")
            if ("__MACOSX" in parts || parts.last().lowercase() in JUNK_NAMES) {
                delete(name)
                report.junkRemoved++
            }
        }
    }

    // ------------------------------------------------------------------ pack
    fun pack(out: OutputStream): Long {
        val zw = ZipWriter(out)
        zw.add("mimetype", MIMETYPE, deflate = false, timeMillis = ZipWriter.FIXED_TIME)
        val entries = source.names.filter { it != "mimetype" && it !in deleted }
        entries.forEachIndexed { i, name ->
            report(Stage.PACKING, 0.95f + 0.05f * i / maxOf(1, entries.size), i + 1, entries.size, name)
            zw.add(renames[name] ?: name, read(name), deflate = true, timeMillis = source.time(name))
        }
        zw.finish()
        return zw.bytesWritten
    }
}

/** Result of [EpubConverter.convert] for in-memory use. */
class ConvertedBook(val bytes: ByteArray, val report: ConversionReport)

object EpubConverter {
    /**
     * Convert [source] and write the new EPUB to [out]. Throws [EpubException] (Swedish message)
     * for books that cannot be processed.
     */
    fun convert(
        source: ZipSource,
        sizeBefore: Long,
        out: OutputStream,
        opts: ConvertOptions,
        images: ImageProcessor,
        progress: ProgressListener? = null,
    ): ConversionReport {
        val report = ConversionReport(sizeBefore = sizeBefore)
        progress?.onProgress(Progress(Stage.READING, 0f))
        try {
            checkDrm(source)
            val book = Book(source, opts, images, progress, report)
            book.convertImages()
            if (!opts.keepFonts) book.removeFonts()
            if (opts.stripCss) book.removeStylesheets()
            book.processFiles()
            book.finishOpf()
            book.removeJunk()
            report.sizeAfter = book.pack(out)
        } catch (e: java.util.zip.ZipException) {
            throw InvalidZipException("Kunde inte läsa zip-arkivet: ${e.message}", e)
        }
        progress?.onProgress(Progress(Stage.PACKING, 1f))
        return report
    }

    /** Convert the EPUB file [input] and write the result to [output]. */
    fun convert(
        input: File,
        output: OutputStream,
        opts: ConvertOptions,
        images: ImageProcessor,
        progress: ProgressListener? = null,
    ): ConversionReport =
        FileZipSource.open(input).use { convert(it, input.length(), output, opts, images, progress) }

    /** Convert EPUB bytes. */
    fun convert(
        data: ByteArray,
        opts: ConvertOptions,
        images: ImageProcessor,
        progress: ProgressListener? = null,
    ): ConvertedBook {
        val out = java.io.ByteArrayOutputStream(data.size / 2 + 1024)
        val report = BytesZipSource(data).use { convert(it, data.size.toLong(), out, opts, images, progress) }
        return ConvertedBook(out.toByteArray(), report)
    }
}
