package se.felixarvid.xteinkepub.core

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.nio.charset.Charset
import java.util.zip.CRC32
import java.util.zip.Deflater
import java.util.zip.ZipException
import java.util.zip.ZipFile
import java.util.zip.ZipInputStream

/** Where the entries of an input EPUB come from. Directory entries are not listed. */
interface ZipSource : AutoCloseable {
    /** File entries in archive order. */
    val names: List<String>
    /** Modification time (java.util.zip millis) of an entry, or -1. */
    fun time(name: String): Long
    fun read(name: String): ByteArray
    fun contains(name: String): Boolean
}

/** Maximum size of one entry we are willing to inflate (zip bombs). */
private const val MAX_ENTRY_BYTES = 512L * 1024 * 1024

private fun readLimited(input: InputStream, name: String): ByteArray {
    val out = ByteArrayOutputStream()
    val buf = ByteArray(64 * 1024)
    var total = 0L
    while (true) {
        val n = input.read(buf)
        if (n < 0) break
        total += n
        if (total > MAX_ENTRY_BYTES) throw InvalidZipException("Zip-arkivet innehåller en orimligt stor fil ($name).")
        out.write(buf, 0, n)
    }
    return out.toByteArray()
}

/** Reads a zip from a file without holding all of it in memory. */
class FileZipSource private constructor(private val zip: ZipFile) : ZipSource {
    private val entries = LinkedHashMap<String, java.util.zip.ZipEntry>()

    init {
        val en = zip.entries()
        while (en.hasMoreElements()) {
            val e = en.nextElement()
            if (!e.isDirectory) entries[e.name] = e
        }
    }

    override val names: List<String> get() = entries.keys.toList()
    override fun time(name: String): Long = entries[name]?.time ?: -1
    override fun contains(name: String) = entries.containsKey(name)

    override fun read(name: String): ByteArray {
        val e = entries[name] ?: throw IOException("saknas: $name")
        try {
            zip.getInputStream(e).use { return readLimited(it, name) }
        } catch (ex: ZipException) {
            throw InvalidZipException("Kunde inte läsa zip-arkivet: ${ex.message}", ex)
        }
    }

    override fun close() = zip.close()

    companion object {
        fun open(file: File): FileZipSource {
            var last: Exception? = null
            // Some old tools write file names in a legacy code page.
            for (cs in listOf(Charsets.UTF_8, Charsets.ISO_8859_1)) {
                try {
                    return FileZipSource(ZipFile(file, cs))
                } catch (e: ZipException) {
                    last = e
                } catch (e: IllegalArgumentException) {
                    last = e
                }
            }
            throw InvalidZipException(cause = last)
        }
    }
}

/** Zip held in memory (tests and small inputs). */
class BytesZipSource(data: ByteArray) : ZipSource {
    private val files = LinkedHashMap<String, ByteArray>()
    private val times = HashMap<String, Long>()

    init {
        fun load(cs: Charset) {
            files.clear()
            ZipInputStream(data.inputStream(), cs).use { zin ->
                while (true) {
                    val e = zin.nextEntry ?: break
                    if (e.isDirectory) continue
                    files[e.name] = readLimited(zin, e.name)
                    times[e.name] = e.time
                }
            }
        }
        try {
            try {
                load(Charsets.UTF_8)
            } catch (e: IllegalArgumentException) {
                load(Charsets.ISO_8859_1)
            }
        } catch (e: ZipException) {
            throw InvalidZipException("Kunde inte läsa zip-arkivet: ${e.message}", e)
        }
        // ZipInputStream silently yields nothing for data that is not a zip.
        if (files.isEmpty()) throw InvalidZipException()
    }

    override val names: List<String> get() = files.keys.toList()
    override fun time(name: String): Long = times[name] ?: -1
    override fun contains(name: String) = files.containsKey(name)
    override fun read(name: String): ByteArray = files[name] ?: throw IOException("saknas: $name")
    override fun close() {}
}

/**
 * Minimal zip writer. Unlike java.util.zip.ZipOutputStream it writes sizes and CRC in the local
 * header (no data descriptors), which is what Python's zipfile does and what small e-reader zip
 * parsers like best. Entries are STORED or DEFLATED (level 9).
 */
class ZipWriter(private val out: OutputStream) {
    private class Central(
        val name: ByteArray, val method: Int, val dosTime: Int, val dosDate: Int,
        val crc: Long, val csize: Long, val size: Long, val offset: Long,
    )

    private val central = ArrayList<Central>()
    var bytesWritten = 0L
        private set

    private fun u16(v: Int) {
        out.write(v and 0xff); out.write((v shr 8) and 0xff); bytesWritten += 2
    }

    private fun u32(v: Long) {
        for (i in 0 until 4) out.write(((v shr (8 * i)) and 0xff).toInt())
        bytesWritten += 4
    }

    private fun bytes(b: ByteArray) {
        out.write(b); bytesWritten += b.size
    }

    fun add(name: String, data: ByteArray, deflate: Boolean, timeMillis: Long) {
        val nameBytes = name.toByteArray(Charsets.UTF_8)
        val crc = CRC32().also { it.update(data) }.value
        var method = 0
        var payload = data
        if (deflate) {
            val d = Deflater(9, true)
            try {
                d.setInput(data)
                d.finish()
                val bo = ByteArrayOutputStream(maxOf(64, data.size / 2))
                val buf = ByteArray(64 * 1024)
                while (!d.finished()) bo.write(buf, 0, d.deflate(buf))
                payload = bo.toByteArray()
                method = 8
            } finally {
                d.end()
            }
        }
        if (data.size.toLong() >= 0xFFFFFFFFL || central.size >= 0xFFFF) {
            throw EpubException("Boken är för stor för ett vanligt zip-arkiv.")
        }
        val (dosDate, dosTime) = dosDateTime(timeMillis)
        val offset = bytesWritten
        u32(0x04034b50L)
        u16(20)
        u16(0x0800) // UTF-8 names
        u16(method)
        u16(dosTime); u16(dosDate)
        u32(crc); u32(payload.size.toLong()); u32(data.size.toLong())
        u16(nameBytes.size); u16(0)
        bytes(nameBytes)
        bytes(payload)
        central.add(Central(nameBytes, method, dosTime, dosDate, crc, payload.size.toLong(), data.size.toLong(), offset))
    }

    fun finish() {
        val start = bytesWritten
        for (c in central) {
            u32(0x02014b50L)
            u16(20); u16(20)
            u16(0x0800)
            u16(c.method)
            u16(c.dosTime); u16(c.dosDate)
            u32(c.crc); u32(c.csize); u32(c.size)
            u16(c.name.size); u16(0); u16(0)
            u16(0); u16(0)
            u32(0x81A40000L) // external attrs: rw-r--r--
            u32(c.offset)
            bytes(c.name)
        }
        val size = bytesWritten - start
        u32(0x06054b50L)
        u16(0); u16(0)
        u16(central.size); u16(central.size)
        u32(size); u32(start)
        u16(0)
        out.flush()
    }

    private fun dosDateTime(millis: Long): Pair<Int, Int> {
        val cal = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"))
        cal.timeInMillis = if (millis <= 0) FIXED_TIME else millis
        var year = cal.get(java.util.Calendar.YEAR)
        if (year < 1980) year = 1980
        if (year > 2107) year = 2107
        val date = ((year - 1980) shl 9) or ((cal.get(java.util.Calendar.MONTH) + 1) shl 5) or cal.get(java.util.Calendar.DAY_OF_MONTH)
        val time = (cal.get(java.util.Calendar.HOUR_OF_DAY) shl 11) or (cal.get(java.util.Calendar.MINUTE) shl 5) or
            (cal.get(java.util.Calendar.SECOND) / 2)
        return date to time
    }

    companion object {
        /** 2000-01-01 00:00:00 UTC, used for the mimetype entry (like the Python tool). */
        const val FIXED_TIME = 946684800000L
    }
}
