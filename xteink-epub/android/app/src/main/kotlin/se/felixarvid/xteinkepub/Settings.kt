package se.felixarvid.xteinkepub

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import se.felixarvid.xteinkepub.core.ConvertOptions

enum class CssMode { SIMPLIFY, KEEP, STRIP }

/** Everything the user can set; remembered between runs. */
data class AppSettings(
    val levels: Int = 256,
    val dither: Boolean = true,
    val keepColor: Boolean = false,
    val rotateLandscape: Boolean = false,
    val keepFonts: Boolean = false,
    val cssMode: CssMode = CssMode.SIMPLIFY,
    val quality: Int = 85,
    val width: Int = 480,
    val height: Int = 800,
    val overwrite: Boolean = false,
    val autoConvertShared: Boolean = true,
    /** Tree URI of the output folder, or null when none is chosen. */
    val outputFolder: String? = null,
) {
    fun toConvertOptions() = ConvertOptions(
        width = width, height = height, quality = quality, levels = levels, dither = dither,
        color = keepColor, rotateLandscape = rotateLandscape, keepFonts = keepFonts,
        keepCss = cssMode == CssMode.KEEP, stripCss = cssMode == CssMode.STRIP,
    )

    companion object {
        const val MIN_QUALITY = 60
        const val MAX_QUALITY = 95
        const val MIN_SIZE = 100
        const val MAX_SIZE = 4000
    }
}

private val Context.dataStore by preferencesDataStore(name = "settings")

class SettingsRepository(private val context: Context) {
    private object Keys {
        val levels = intPreferencesKey("levels")
        val dither = booleanPreferencesKey("dither")
        val keepColor = booleanPreferencesKey("keep_color")
        val rotate = booleanPreferencesKey("rotate_landscape")
        val keepFonts = booleanPreferencesKey("keep_fonts")
        val cssMode = stringPreferencesKey("css_mode")
        val quality = intPreferencesKey("quality")
        val width = intPreferencesKey("width")
        val height = intPreferencesKey("height")
        val overwrite = booleanPreferencesKey("overwrite")
        val autoConvert = booleanPreferencesKey("auto_convert_shared")
        val folder = stringPreferencesKey("output_folder")
    }

    val flow: Flow<AppSettings> = context.dataStore.data.map { p -> p.toSettings() }

    suspend fun update(transform: (AppSettings) -> AppSettings) {
        context.dataStore.edit { p ->
            val s = transform(p.toSettings())
            p[Keys.levels] = s.levels
            p[Keys.dither] = s.dither
            p[Keys.keepColor] = s.keepColor
            p[Keys.rotate] = s.rotateLandscape
            p[Keys.keepFonts] = s.keepFonts
            p[Keys.cssMode] = s.cssMode.name
            p[Keys.quality] = s.quality
            p[Keys.width] = s.width
            p[Keys.height] = s.height
            p[Keys.overwrite] = s.overwrite
            p[Keys.autoConvert] = s.autoConvertShared
            if (s.outputFolder != null) p[Keys.folder] = s.outputFolder else p.remove(Keys.folder)
        }
    }

    private fun Preferences.toSettings(): AppSettings {
        val d = AppSettings()
        return AppSettings(
            levels = (this[Keys.levels] ?: d.levels).takeIf { it in setOf(256, 16, 4) } ?: d.levels,
            dither = this[Keys.dither] ?: d.dither,
            keepColor = this[Keys.keepColor] ?: d.keepColor,
            rotateLandscape = this[Keys.rotate] ?: d.rotateLandscape,
            keepFonts = this[Keys.keepFonts] ?: d.keepFonts,
            cssMode = this[Keys.cssMode]?.let { n -> CssMode.entries.firstOrNull { it.name == n } } ?: d.cssMode,
            quality = (this[Keys.quality] ?: d.quality).coerceIn(AppSettings.MIN_QUALITY, AppSettings.MAX_QUALITY),
            width = (this[Keys.width] ?: d.width).coerceIn(AppSettings.MIN_SIZE, AppSettings.MAX_SIZE),
            height = (this[Keys.height] ?: d.height).coerceIn(AppSettings.MIN_SIZE, AppSettings.MAX_SIZE),
            overwrite = this[Keys.overwrite] ?: d.overwrite,
            autoConvertShared = this[Keys.autoConvert] ?: d.autoConvertShared,
            outputFolder = this[Keys.folder],
        )
    }
}
