package se.felixarvid.xteinkepub

import android.app.Application
import android.content.Intent
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import se.felixarvid.xteinkepub.core.ConversionReport
import se.felixarvid.xteinkepub.core.EpubConverter
import se.felixarvid.xteinkepub.core.EpubException
import se.felixarvid.xteinkepub.core.Progress
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

sealed interface BookStatus {
    data object Waiting : BookStatus
    data class Converting(val fraction: Float) : BookStatus
    data class Done(
        val outputName: String,
        val sizeBefore: Long,
        val sizeAfter: Long,
        val imagesConverted: Int,
        val fontsRemoved: Int,
        val warnings: List<String>,
        /** Copy in the app cache that "Dela" shares through the FileProvider. */
        val shareFile: File?,
    ) : BookStatus
    data class Failed(val message: String) : BookStatus
}

data class BookItem(
    val id: Long,
    val uri: Uri,
    val name: String,
    val size: Long?,
    val status: BookStatus = BookStatus.Waiting,
)

data class UiState(
    val books: List<BookItem> = emptyList(),
    val settings: AppSettings = AppSettings(),
    val settingsLoaded: Boolean = false,
    /** Display name of the output folder, or null when none is usable. */
    val folderName: String? = null,
    val running: Boolean = false,
    /** Overall progress of the current run, 0..1. */
    val overall: Float = 0f,
    val runIndex: Int = 0,
    val runTotal: Int = 0,
)

sealed interface UiEvent {
    data class Message(val text: String) : UiEvent
    /** Open the folder picker (the user pressed Konvertera without a folder). */
    data object PickFolder : UiEvent
}

class MainViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = SettingsRepository(app)
    private val dirs = CacheDirs(app)
    private val processor = BitmapImageProcessor()
    private var nextId = 1L

    private val books = MutableStateFlow<List<BookItem>>(emptyList())
    private val running = MutableStateFlow(false)
    private val runIds = MutableStateFlow<List<Long>>(emptyList())
    private val folderValid = MutableStateFlow<Pair<String?, String?>>(null to null) // uri -> display name
    private val events = Channel<UiEvent>(Channel.BUFFERED)
    val eventFlow = events.receiveAsFlow()

    private var job: Job? = null
    private var convertWhenFolderChosen = false

    private val settingsFlow = repo.flow.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val state: StateFlow<UiState> = combine(books, settingsFlow, running, runIds, folderValid) { list, st, run, ids, folder ->
        val settings = st ?: AppSettings()
        val inRun = list.filter { it.id in ids }
        val overall = if (inRun.isEmpty()) 0f else inRun.sumOf { b ->
            when (val s = b.status) {
                is BookStatus.Converting -> s.fraction.toDouble()
                is BookStatus.Waiting -> 0.0
                else -> 1.0
            }
        }.toFloat() / inRun.size
        val current = inRun.indexOfFirst { it.status is BookStatus.Converting }
        UiState(
            books = list,
            settings = settings,
            settingsLoaded = st != null,
            folderName = if (folder.first == settings.outputFolder) folder.second else null,
            running = run,
            overall = overall,
            runIndex = if (current >= 0) current + 1 else inRun.count { it.status !is BookStatus.Waiting },
            runTotal = inRun.size,
        )
    }.stateIn(viewModelScope, SharingStarted.Eagerly, UiState())

    init {
        // anything left in the cache belongs to an earlier process
        dirs.clearAll()
        viewModelScope.launch {
            // only when the folder itself changes, not on every switch the user flips
            settingsFlow.filterNotNull().map { it.outputFolder }.distinctUntilChanged().collect { refreshFolder(it) }
        }
    }

    // ------------------------------------------------------------- settings

    fun updateSettings(transform: (AppSettings) -> AppSettings) {
        viewModelScope.launch { repo.update(transform) }
    }

    /** Checks that the saved folder is still writable and finds its name. */
    private suspend fun refreshFolder(uriString: String?) {
        if (uriString == null) {
            folderValid.value = null to null
            return
        }
        val result = withContext(Dispatchers.IO) {
            val ctx = getApplication<Application>()
            val uri = Uri.parse(uriString)
            // exists()/canWrite() query the provider, which fails once the permission is gone
            val doc = DocumentFile.fromTreeUri(ctx, uri)
            if (doc != null && doc.exists() && doc.canWrite()) doc.name ?: uri.lastPathSegment.orEmpty() else null
        }
        folderValid.value = uriString to result
        if (result == null) post(getApplication<Application>().getString(R.string.output_folder_lost))
    }

    fun setOutputFolder(uri: Uri) {
        val ctx = getApplication<Application>()
        try {
            ctx.contentResolver.takePersistableUriPermission(
                uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
            )
        } catch (_: Exception) {
            // not persistable (or not needed): still usable for this session
        }
        viewModelScope.launch {
            repo.update { it.copy(outputFolder = uri.toString()) }
            refreshFolder(uri.toString())
            if (convertWhenFolderChosen) {
                convertWhenFolderChosen = false
                if (folderValid.value.second != null) startConversion()
            }
        }
    }

    fun folderPickerCancelled() {
        convertWhenFolderChosen = false
    }

    // ---------------------------------------------------------------- books

    /** Add books chosen with the picker or delivered by "Öppna med" / "Dela". */
    fun addBooks(uris: List<Uri>, fromIntent: Boolean) {
        val ctx = getApplication<Application>()
        viewModelScope.launch {
            val added = withContext(Dispatchers.IO) {
                val known = books.value.map { it.uri }.toSet()
                val result = ArrayList<BookItem>()
                for (uri in uris.distinct()) {
                    if (uri in known) continue
                    val info = ctx.contentResolver.queryInfo(uri)
                    val mime = try { ctx.contentResolver.getType(uri) } catch (_: Exception) { null }
                    if (!looksLikeEpub(info.name, mime)) {
                        post(ctx.getString(R.string.not_epub, info.name))
                        continue
                    }
                    result.add(BookItem(nextId++, uri, info.name, info.size))
                }
                result
            }
            if (added.isEmpty()) return@launch
            books.update { it + added }
            if (fromIntent && !running.value) {
                val st = repo.flow.first()
                if (st.autoConvertShared && folderValid.value.second != null) startConversion()
            }
            // a running job picks up new waiting books in its next round
        }
    }

    fun removeBook(id: Long) {
        val b = books.value.firstOrNull { it.id == id } ?: return
        if (b.status is BookStatus.Converting) return
        (b.status as? BookStatus.Done)?.shareFile?.parentFile?.deleteRecursively()
        books.update { list -> list.filter { it.id != id } }
    }

    fun clearFinished() {
        books.value.filter { it.status is BookStatus.Done }.forEach { removeBook(it.id) }
    }

    // ----------------------------------------------------------- conversion

    /** The Konvertera button. Asks for an output folder first if there is none. */
    fun convertClicked() {
        if (running.value) return
        if (books.value.none { it.status is BookStatus.Waiting || it.status is BookStatus.Failed }) {
            post(getApplication<Application>().getString(R.string.nothing_to_convert))
            return
        }
        if (folderValid.value.second == null) {
            convertWhenFolderChosen = true
            post(getApplication<Application>().getString(R.string.folder_needed))
            events.trySend(UiEvent.PickFolder)
            return
        }
        startConversion()
    }

    fun cancel() {
        job?.cancel()
    }

    private fun startConversion() {
        if (running.value) return
        running.value = true
        job = viewModelScope.launch {
            try {
                runQueue()
            } finally {
                running.value = false
            }
        }
    }

    private suspend fun runQueue() {
        val ctx = getApplication<Application>()
        val settings = repo.flow.first()
        val folder = settings.outputFolder?.let(Uri::parse) ?: return
        val options = settings.toConvertOptions()
        var failed = 0
        var total = 0
        val ids = ArrayList<Long>()
        runIds.value = emptyList()
        while (true) {
            // books added while running are picked up here
            val next = books.value.firstOrNull { it.status is BookStatus.Waiting || (it.status is BookStatus.Failed && it.id !in ids) }
                ?: break
            ids.add(next.id)
            runIds.value = ids.toList()
            total++
            val ok = convertOne(next, settings, options, folder)
            if (!ok) failed++
        }
        if (total > 0) {
            post(if (failed == 0) ctx.getString(R.string.all_done) else ctx.getString(R.string.some_failed, failed))
        }
    }

    private fun setStatus(id: Long, status: BookStatus) {
        books.update { list -> list.map { if (it.id == id) it.copy(status = status) else it } }
    }

    /** Returns true when the book was converted. Rethrows cancellation after resetting the book. */
    private suspend fun convertOne(book: BookItem, settings: AppSettings, options: se.felixarvid.xteinkepub.core.ConvertOptions, folder: Uri): Boolean {
        val ctx = getApplication<Application>()
        setStatus(book.id, BookStatus.Converting(0f))
        dirs.input.mkdirs()
        val bookOutDir = File(dirs.output, book.id.toString()).also { it.mkdirs() }
        val input = File(dirs.input, "${book.id}.epub")
        val base = baseName(book.name)
        val result = File(bookOutDir, base + OUTPUT_SUFFIX)
        try {
            val (savedName, report) = withContext(Dispatchers.Default) {
                val jobRef = currentCoroutineContext()[Job]!!
                withContext(Dispatchers.IO) { ctx.contentResolver.copyToFile(book.uri, input) }
                var last = -1f
                val listener = se.felixarvid.xteinkepub.core.ProgressListener { p: Progress ->
                    jobRef.ensureActive()
                    // 0.5 % steps are plenty for a progress bar
                    if (p.fraction - last >= 0.005f || p.fraction >= 1f) {
                        last = p.fraction
                        setStatus(book.id, BookStatus.Converting(p.fraction))
                    }
                }
                val report: ConversionReport = FileOutputStream(result).buffered(64 * 1024).use { out ->
                    EpubConverter.convert(input, out, options, processor, listener)
                }
                jobRef.ensureActive()
                val name = withContext(Dispatchers.IO) { writeToFolder(ctx, folder, base, result, settings.overwrite) }
                name to report
            }
            setStatus(
                book.id,
                BookStatus.Done(
                    outputName = savedName,
                    sizeBefore = report.sizeBefore,
                    sizeAfter = report.sizeAfter,
                    imagesConverted = report.imagesConverted,
                    fontsRemoved = report.fontsRemoved,
                    warnings = report.warnings.toList(),
                    shareFile = result,
                ),
            )
            return true
        } catch (e: CancellationException) {
            result.delete()
            setStatus(book.id, BookStatus.Waiting)
            throw e
        } catch (e: EpubException) {
            result.delete()
            setStatus(book.id, BookStatus.Failed(e.message ?: ctx.getString(R.string.error_unexpected, "")))
        } catch (e: OutOfMemoryError) {
            result.delete()
            setStatus(book.id, BookStatus.Failed(ctx.getString(R.string.error_out_of_memory)))
        } catch (e: IOException) {
            result.delete()
            val msg = if (e is java.io.FileNotFoundException) ctx.getString(R.string.error_cannot_read, e.message ?: "")
            else ctx.getString(R.string.error_io, e.message ?: "")
            setStatus(book.id, BookStatus.Failed(msg))
        } catch (e: Exception) {
            result.delete()
            setStatus(book.id, BookStatus.Failed(ctx.getString(R.string.error_unexpected, e.message ?: e.javaClass.simpleName)))
        } finally {
            input.delete()
        }
        return false
    }

    private fun post(text: String) {
        events.trySend(UiEvent.Message(text))
    }
}
