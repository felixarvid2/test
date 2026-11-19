package se.felixarvid.xteinkepub

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import java.io.File
import java.io.FileNotFoundException

/**
 * A tiny storage-access-framework provider over a temp folder, so that the SAF code of the app can
 * run in Robolectric. It is a plain ContentProvider because Robolectric calls the legacy `query`
 * overload, which `DocumentsProvider` forbids. Document ids are paths relative to [rootDir]
 * ("root" is the folder itself).
 */
class TestDocsProvider : ContentProvider() {
    companion object {
        const val AUTHORITY = "se.felixarvid.xteinkepub.testdocs"
        @Volatile var rootDir: File = File(".")
        private val COLS = arrayOf(
            Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_SIZE,
            Document.COLUMN_MIME_TYPE, Document.COLUMN_FLAGS, Document.COLUMN_LAST_MODIFIED,
        )
    }

    override fun onCreate() = true

    private fun fileOf(id: String): File = if (id == "root") rootDir else File(rootDir, id)
    private fun idOf(f: File): String = if (f == rootDir) "root" else f.relativeTo(rootDir).path

    private fun row(c: MatrixCursor, f: File, projection: Array<out String>) {
        val dir = f.isDirectory
        val values = mapOf<String, Any?>(
            Document.COLUMN_DOCUMENT_ID to idOf(f),
            Document.COLUMN_DISPLAY_NAME to if (f == rootDir) "Testmapp" else f.name,
            Document.COLUMN_SIZE to f.length(),
            Document.COLUMN_MIME_TYPE to if (dir) Document.MIME_TYPE_DIR else "application/epub+zip",
            Document.COLUMN_FLAGS to if (dir) Document.FLAG_DIR_SUPPORTS_CREATE else Document.FLAG_SUPPORTS_WRITE or Document.FLAG_SUPPORTS_DELETE,
            Document.COLUMN_LAST_MODIFIED to f.lastModified(),
        )
        c.addRow(projection.map { values[it] })
    }

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor {
        val proj = projection ?: COLS
        val c = MatrixCursor(proj)
        val seg = uri.pathSegments
        val docId = DocumentsContract.getDocumentId(uri)
        val f = fileOf(docId)
        if (seg.last() == "children") {
            f.listFiles()?.sortedBy { it.name }?.forEach { row(c, it, proj) }
        } else if (f.exists()) {
            row(c, f, proj)
        }
        return c
    }

    override fun call(method: String, arg: String?, extras: Bundle?): Bundle? {
        val parentUri = extras?.getParcelable<Uri>("uri") ?: return null
        return when (method) {
            "android:createDocument" -> {
                val name = extras.getString("_display_name")!!
                val mime = extras.getString("mime_type")!!
                val f = File(fileOf(DocumentsContract.getDocumentId(parentUri)), name)
                if (mime == Document.MIME_TYPE_DIR) f.mkdirs() else f.createNewFile()
                Bundle().apply { putParcelable("uri", DocumentsContract.buildDocumentUriUsingTree(parentUri, idOf(f))) }
            }
            "android:deleteDocument" -> {
                fileOf(DocumentsContract.getDocumentId(parentUri)).deleteRecursively()
                Bundle()
            }
            else -> null
        }
    }

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        val f = fileOf(DocumentsContract.getDocumentId(uri))
        if (!f.exists()) throw FileNotFoundException(uri.toString())
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.parseMode(mode))
    }

    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?) = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?) = 0
}
