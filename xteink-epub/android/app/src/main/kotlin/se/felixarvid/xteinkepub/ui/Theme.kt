package se.felixarvid.xteinkepub.ui

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

private val LightColors = lightColorScheme(
    primary = Color(0xFF2F4858),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD0E4F0),
    secondary = Color(0xFF5A6A73),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFB4CAD8),
    onPrimary = Color(0xFF1B3341),
    primaryContainer = Color(0xFF2F4858),
    secondary = Color(0xFFBDC8D0),
)

/** Material 3 with dynamic color on Android 12+, a quiet blue-gray scheme before that. */
@Composable
fun XteinkTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val scheme = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (dark) dynamicDarkColorScheme(LocalContext.current) else dynamicLightColorScheme(LocalContext.current)
        dark -> DarkColors
        else -> LightColors
    }
    MaterialTheme(colorScheme = scheme, content = content)
}
