package se.felixarvid.xteinkepub

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.documentfile.provider.DocumentFile
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.Locale

const val EPUB_MIME = "application/epub+zip"
const val OUTPUT_SUFFIX = ".xteink.epub"

data class UriInfo(val name: String, val size: Long?)

/** Display name and size of a content (or file) URI. */
fun ContentResolver.queryInfo(uri: Uri): UriInfo {
    var name: String? = null
    var size: Long? = null
    if (uri.scheme == ContentResolver.SCHEME_CONTENT) {
        try {
            query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                if (c.moveToFirst()) {
                    val ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    val si = c.getColumnIndex(OpenableColumns.SIZE)
                    if (ni >= 0 && !c.isNull(ni)) name = c.getString(ni)
                    if (si >= 0 && !c.isNull(si)) size = c.getLong(si)
                }
            }
        } catch (_: Exception) {
            // fall back to the path below
        }
    }
    if (name.isNullOrBlank()) name = uri.lastPathSegment?.substringAfterLast('/') ?: "bok.epub"
    return UriInfo(name, size)
}

fun looksLikeEpub(name: String, mime: String?): Boolean =
    name.endsWith(".epub", ignoreCase = true) || mime.equals(EPUB_MIME, ignoreCase = true)

/** `Bok.epub` / `Bok.xteink.epub` -> `Bok` (safe as a file name). */
fun baseName(displayName: String): String {
    var n = displayName.substringAfterLast('/').trim()
    if (n.endsWith(".epub", ignoreCase = true)) n = n.dropLast(5)
    if (n.endsWith(".xteink", ignoreCase = true)) n = n.dropLast(7)
    n = n.replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_").trim().trim('.')
    return n.ifEmpty { "bok" }
}

/** Copy the content behind [uri] to [dest], streaming (nothing is held in memory). */
fun ContentResolver.copyToFile(uri: Uri, dest: File) {
    val input = openInputStream(uri) ?: throw IOException("kunde inte öppna filen")
    input.use { inp -> FileOutputStream(dest).use { out -> inp.copyTo(out, 64 * 1024) } }
}

fun formatSize(bytes: Long): String =
    if (bytes >= 1024 * 1024) String.format(Locale.getDefault(), "%.1f MB", bytes / 1024.0 / 1024.0)
    else String.format(Locale.getDefault(), "%.0f kB", bytes / 1024.0)

/** Cache folders of the app. */
class CacheDirs(context: Context) {
    val input = File(context.cacheDir, "in")
    val output = File(context.cacheDir, "out")

    fun clearAll() {
        input.deleteRecursively()
        output.deleteRecursively()
    }
}

/**
 * Write [source] into the SAF folder [tree] as [baseName].xteink.epub.
 * Returns the name of the created (or overwritten) file.
 */
fun writeToFolder(context: Context, tree: Uri, baseName: String, source: File, overwrite: Boolean): String {
    val dir = DocumentFile.fromTreeUri(context, tree) ?: throw IOException("mappen finns inte längre")
    if (!dir.exists() || !dir.isDirectory) throw IOException("mappen finns inte längre")
    if (!dir.canWrite()) throw IOException("ingen skrivrättighet till mappen")
    var name = baseName + OUTPUT_SUFFIX
    val existing = dir.findFile(name)
    val target: DocumentFile
    var mode = "w"
    if (existing != null && overwrite) {
        target = existing
        mode = "wt" // truncate
    } else {
        var n = 2
        while (dir.findFile(name) != null) {
            name = "$baseName ($n)$OUTPUT_SUFFIX"
            n++
        }
        target = dir.createFile(EPUB_MIME, name) ?: throw IOException("kunde inte skapa $name")
    }
    try {
        val out = context.contentResolver.openOutputStream(target.uri, mode) ?: throw IOException("kunde inte skriva ${target.name}")
        out.use { o -> source.inputStream().use { it.copyTo(o, 64 * 1024) } }
    } catch (e: Exception) {
        if (target !== existing) target.delete()
        throw if (e is IOException) e else IOException(e.message, e)
    }
    return target.name ?: name
}
