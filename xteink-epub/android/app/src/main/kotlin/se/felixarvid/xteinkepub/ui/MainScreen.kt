package se.felixarvid.xteinkepub.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import se.felixarvid.xteinkepub.AppSettings
import se.felixarvid.xteinkepub.BookItem
import se.felixarvid.xteinkepub.BookStatus
import se.felixarvid.xteinkepub.CssMode
import se.felixarvid.xteinkepub.R
import se.felixarvid.xteinkepub.UiState
import se.felixarvid.xteinkepub.formatSize
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    state: UiState,
    snackbarHost: SnackbarHostState,
    onPickBooks: () -> Unit,
    onPickFolder: () -> Unit,
    onConvert: () -> Unit,
    onCancel: () -> Unit,
    onRemove: (Long) -> Unit,
    onClearFinished: () -> Unit,
    onShare: (File) -> Unit,
    onSettings: (((AppSettings) -> AppSettings)) -> Unit,
) {
    // keep the screen on while a conversion runs: it is not a background service
    val view = LocalView.current
    DisposableEffect(state.running) {
        view.keepScreenOn = state.running
        onDispose { view.keepScreenOn = false }
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text(stringResource(R.string.app_name)) }) },
        snackbarHost = { SnackbarHost(snackbarHost) },
        bottomBar = { BottomBar(state, onConvert, onCancel) },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item { BooksCard(state, onPickBooks, onRemove, onClearFinished, onShare) }
            item { OutputCard(state, onPickFolder, onSettings) }
            item { SettingsCard(state.settings, onSettings) }
        }
    }
}

// ---------------------------------------------------------------- bottom bar

@Composable
private fun BottomBar(state: UiState, onConvert: () -> Unit, onCancel: () -> Unit) {
    Surface(tonalElevation = 3.dp, modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier
                .windowInsetsPadding(WindowInsets.navigationBars)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (state.running) {
                Text(
                    stringResource(R.string.converting_overall, state.runIndex.coerceAtLeast(1), state.runTotal),
                    style = MaterialTheme.typography.labelLarge,
                )
                LinearProgressIndicator(progress = { state.overall }, modifier = Modifier.fillMaxWidth())
                OutlinedButton(onClick = onCancel, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.cancel)) }
            } else {
                val pending = state.books.count { it.status is BookStatus.Waiting || it.status is BookStatus.Failed }
                Button(onClick = onConvert, modifier = Modifier.fillMaxWidth()) {
                    Text(if (pending > 0) stringResource(R.string.convert_count, pending) else stringResource(R.string.convert))
                }
            }
        }
    }
}

// --------------------------------------------------------------------- books

@Composable
private fun SectionCard(title: String, content: @Composable () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            content()
        }
    }
}

@Composable
private fun BooksCard(
    state: UiState,
    onPickBooks: () -> Unit,
    onRemove: (Long) -> Unit,
    onClearFinished: () -> Unit,
    onShare: (File) -> Unit,
) {
    SectionCard(stringResource(R.string.section_books)) {
        Button(onClick = onPickBooks, enabled = !state.running) { Text(stringResource(R.string.pick_epubs)) }
        if (state.books.isEmpty()) {
            Text(
                stringResource(R.string.no_books_hint),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Column {
                state.books.forEachIndexed { i, book ->
                    if (i > 0) HorizontalDivider()
                    BookRow(book, onRemove, onShare)
                }
            }
            if (state.books.any { it.status is BookStatus.Done } && !state.running) {
                TextButton(onClick = onClearFinished) { Text(stringResource(R.string.clear_finished)) }
            }
        }
    }
}

@Composable
private fun BookRow(book: BookItem, onRemove: (Long) -> Unit, onShare: (File) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(book.name, style = MaterialTheme.typography.bodyLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
            when (val s = book.status) {
                BookStatus.Waiting -> Text(
                    buildString {
                        append(stringResource(R.string.status_waiting))
                        book.size?.let { append(" · ").append(formatSize(it)) }
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                is BookStatus.Converting -> {
                    Text(
                        stringResource(R.string.status_converting, (s.fraction * 100).toInt()),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    LinearProgressIndicator(progress = { s.fraction }, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
                }
                is BookStatus.Done -> {
                    val pct = if (s.sizeBefore > 0) Math.round((s.sizeAfter - s.sizeBefore) * 100.0 / s.sizeBefore).toInt() else 0
                    Text(
                        stringResource(R.string.status_done, formatSize(s.sizeBefore), formatSize(s.sizeAfter), "$pct %"),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        stringResource(R.string.done_details, s.imagesConverted, s.fontsRemoved),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        stringResource(R.string.saved_as, s.outputName),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (s.warnings.isNotEmpty()) {
                        Text(
                            pluralStringResource(R.plurals.warnings, s.warnings.size, s.warnings.size),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.tertiary,
                        )
                        s.warnings.take(3).forEach {
                            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    s.shareFile?.let { f ->
                        TextButton(onClick = { onShare(f) }) {
                            Icon(Icons.Filled.Share, contentDescription = null, modifier = Modifier.padding(end = 8.dp))
                            Text(stringResource(R.string.share))
                        }
                    }
                }
                is BookStatus.Failed -> Text(
                    stringResource(R.string.status_failed, s.message),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
        if (book.status !is BookStatus.Converting) {
            IconButton(onClick = { onRemove(book.id) }) {
                Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.remove_book))
            }
        }
    }
}

// -------------------------------------------------------------------- output

@Composable
private fun OutputCard(state: UiState, onPickFolder: () -> Unit, onSettings: (((AppSettings) -> AppSettings)) -> Unit) {
    SectionCard(stringResource(R.string.section_output)) {
        Text(
            if (state.folderName != null) stringResource(R.string.output_folder_current, state.folderName)
            else stringResource(R.string.output_folder_none),
            style = MaterialTheme.typography.bodyMedium,
        )
        OutlinedButton(onClick = onPickFolder, enabled = !state.running) {
            Text(stringResource(if (state.folderName != null) R.string.change_output_folder else R.string.pick_output_folder))
        }
        Text(
            stringResource(R.string.output_file_hint),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(stringResource(R.string.name_conflict), style = MaterialTheme.typography.labelLarge)
        RadioRow(stringResource(R.string.conflict_number), !state.settings.overwrite) { onSettings { it.copy(overwrite = false) } }
        RadioRow(stringResource(R.string.conflict_overwrite), state.settings.overwrite) { onSettings { it.copy(overwrite = true) } }
    }
}

@Composable
private fun RadioRow(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .selectable(selected = selected, onClick = onClick, role = Role.RadioButton)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = selected, onClick = null)
        Text(label, modifier = Modifier.padding(start = 12.dp), style = MaterialTheme.typography.bodyLarge)
    }
}


// ------------------------------------------------------------------ settings

@Composable
private fun SettingsCard(s: AppSettings, onSettings: (((AppSettings) -> AppSettings)) -> Unit) {
    SectionCard(stringResource(R.string.section_settings)) {
        Text(stringResource(R.string.gray_levels), style = MaterialTheme.typography.labelLarge)
        val levels = listOf(256 to R.string.levels_256, 16 to R.string.levels_16, 4 to R.string.levels_4)
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            levels.forEachIndexed { i, (value, label) ->
                SegmentedButton(
                    selected = s.levels == value,
                    onClick = { onSettings { it.copy(levels = value) } },
                    shape = SegmentedButtonDefaults.itemShape(i, levels.size),
                    enabled = !s.keepColor,
                ) { Text(stringResource(label), maxLines = 1) }
            }
        }
        SwitchRow(R.string.dithering, R.string.dithering_hint, s.dither, enabled = s.levels < 256 && !s.keepColor) { v ->
            onSettings { it.copy(dither = v) }
        }
        SwitchRow(R.string.keep_color, R.string.keep_color_hint, s.keepColor) { v -> onSettings { it.copy(keepColor = v) } }
        SwitchRow(R.string.rotate_landscape, R.string.rotate_landscape_hint, s.rotateLandscape) { v ->
            onSettings { it.copy(rotateLandscape = v) }
        }
        SwitchRow(R.string.keep_fonts, R.string.keep_fonts_hint, s.keepFonts) { v -> onSettings { it.copy(keepFonts = v) } }

        Text(stringResource(R.string.css), style = MaterialTheme.typography.labelLarge)
        val css = listOf(CssMode.SIMPLIFY to R.string.css_simplify, CssMode.KEEP to R.string.css_keep, CssMode.STRIP to R.string.css_strip)
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            css.forEachIndexed { i, (mode, label) ->
                SegmentedButton(
                    selected = s.cssMode == mode,
                    onClick = { onSettings { it.copy(cssMode = mode) } },
                    shape = SegmentedButtonDefaults.itemShape(i, css.size),
                ) { Text(stringResource(label), maxLines = 1) }
            }
        }

        var quality by remember(s.quality) { mutableFloatStateOf(s.quality.toFloat()) }
        Text(stringResource(R.string.jpeg_quality, quality.toInt()), style = MaterialTheme.typography.labelLarge)
        Slider(
            value = quality,
            onValueChange = { quality = it },
            onValueChangeFinished = { val q = quality.toInt(); onSettings { it.copy(quality = q) } },
            valueRange = AppSettings.MIN_QUALITY.toFloat()..AppSettings.MAX_QUALITY.toFloat(),
            steps = AppSettings.MAX_QUALITY - AppSettings.MIN_QUALITY - 1,
        )

        SwitchRow(R.string.auto_convert_shared, null, s.autoConvertShared) { v -> onSettings { it.copy(autoConvertShared = v) } }

        var advanced by rememberSaveable { mutableStateOf(false) }
        TextButton(onClick = { advanced = !advanced }) { Text(stringResource(R.string.advanced)) }
        if (advanced) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                SizeField(R.string.target_width, s.width, Modifier.weight(1f)) { v -> onSettings { it.copy(width = v) } }
                SizeField(R.string.target_height, s.height, Modifier.weight(1f)) { v -> onSettings { it.copy(height = v) } }
            }
            Text(
                stringResource(R.string.target_size_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.height(4.dp))
    }
}

@Composable
private fun SizeField(label: Int, value: Int, modifier: Modifier, onValid: (Int) -> Unit) {
    var text by remember(value) { mutableStateOf(value.toString()) }
    val parsed = text.toIntOrNull()
    val valid = parsed != null && parsed in AppSettings.MIN_SIZE..AppSettings.MAX_SIZE
    OutlinedTextField(
        value = text,
        onValueChange = {
            text = it.filter(Char::isDigit).take(4)
            val n = text.toIntOrNull()
            if (n != null && n in AppSettings.MIN_SIZE..AppSettings.MAX_SIZE) onValid(n)
        },
        label = { Text(stringResource(label)) },
        singleLine = true,
        isError = !valid,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = modifier,
    )
}

@Composable
private fun SwitchRow(title: Int, subtitle: Int?, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(
                stringResource(title),
                style = MaterialTheme.typography.bodyLarge,
                color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
            )
            if (subtitle != null) {
                Text(stringResource(subtitle), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}
