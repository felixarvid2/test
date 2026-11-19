package se.felixarvid.xteinkepub

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.core.content.FileProvider
import androidx.core.content.IntentCompat
import se.felixarvid.xteinkepub.ui.MainScreen
import se.felixarvid.xteinkepub.ui.XteinkTheme
import java.io.File

class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            XteinkTheme {
                Content()
            }
        }
        // A rotation recreates the activity with the same intent: only the first start counts.
        if (savedInstanceState == null) handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    @Composable
    private fun Content() {
        val state by viewModel.state.collectAsState()
        val pickBooks = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
            viewModel.addBooks(uris, fromIntent = false)
        }
        val pickFolder = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
            if (uri != null) viewModel.setOutputFolder(uri) else viewModel.folderPickerCancelled()
        }
        val messages = androidx.compose.runtime.remember { androidx.compose.material3.SnackbarHostState() }
        LaunchedEffect(Unit) {
            viewModel.eventFlow.collect { event ->
                when (event) {
                    is UiEvent.Message -> messages.showSnackbar(event.text)
                    UiEvent.PickFolder -> pickFolder.launch(null)
                }
            }
        }
        MainScreen(
            state = state,
            snackbarHost = messages,
            onPickBooks = { pickBooks.launch(arrayOf(EPUB_MIME, "application/octet-stream")) },
            onPickFolder = { pickFolder.launch(null) },
            onConvert = viewModel::convertClicked,
            onCancel = viewModel::cancel,
            onRemove = viewModel::removeBook,
            onClearFinished = viewModel::clearFinished,
            onShare = ::shareFile,
            onSettings = viewModel::updateSettings,
        )
    }

    /** "Öppna med" and "Dela": add the files to the list (and convert at once if so set). */
    private fun handleIntent(intent: Intent?) {
        intent ?: return
        val uris = LinkedHashSet<Uri>()
        when (intent.action) {
            Intent.ACTION_VIEW -> intent.data?.let(uris::add)
            Intent.ACTION_SEND ->
                IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)?.let(uris::add)
            Intent.ACTION_SEND_MULTIPLE ->
                IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)?.let(uris::addAll)
            else -> return
        }
        val clip = intent.clipData
        if (uris.isEmpty() && clip != null) {
            for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let(uris::add)
        }
        if (uris.isNotEmpty()) viewModel.addBooks(uris.toList(), fromIntent = true)
    }

    private fun shareFile(file: File) {
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = EPUB_MIME
            putExtra(Intent.EXTRA_STREAM, uri)
            clipData = ClipData.newRawUri(file.name, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivity(Intent.createChooser(send, getString(R.string.share_chooser)))
    }
}
