package com.taskflowai.taskflowai.presentation.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.unit.dp

private val LocalTaskflowColors = staticCompositionLocalOf { LightTokens }

/** Access to the full token set, including tokens Material has no slot for. */
object Taskflow {
    val colors: TaskflowColors
        @Composable @ReadOnlyComposable get() = LocalTaskflowColors.current
}

private fun scheme(t: TaskflowColors, dark: Boolean) = if (dark) {
    darkColorScheme(
        primary = t.accent, onPrimary = t.accentFg, primaryContainer = t.accentSoft, onPrimaryContainer = t.accent,
        secondary = t.fgMuted, onSecondary = t.surface, secondaryContainer = t.subtle, onSecondaryContainer = t.fg,
        background = t.canvas, onBackground = t.fg, surface = t.surface, onSurface = t.fg,
        surfaceVariant = t.subtle, onSurfaceVariant = t.fgMuted, surfaceContainer = t.surface,
        surfaceContainerHigh = t.surface, surfaceContainerHighest = t.subtle, surfaceContainerLow = t.canvas,
        outline = t.lineStrong, outlineVariant = t.line, error = t.danger, onError = t.surface,
        errorContainer = t.dangerSoft, onErrorContainer = t.danger, scrim = t.canvas,
    )
} else {
    lightColorScheme(
        primary = t.accent, onPrimary = t.accentFg, primaryContainer = t.accentSoft, onPrimaryContainer = t.accent,
        secondary = t.fgMuted, onSecondary = t.surface, secondaryContainer = t.subtle, onSecondaryContainer = t.fg,
        background = t.canvas, onBackground = t.fg, surface = t.surface, onSurface = t.fg,
        surfaceVariant = t.subtle, onSurfaceVariant = t.fgMuted, surfaceContainer = t.surface,
        surfaceContainerHigh = t.surface, surfaceContainerHighest = t.subtle, surfaceContainerLow = t.canvas,
        outline = t.lineStrong, outlineVariant = t.line, error = t.danger, onError = t.surface,
        errorContainer = t.dangerSoft, onErrorContainer = t.danger,
    )
}

/** Same radii as the web app: 6dp controls, 8dp cards and dialogs. */
private val TaskflowShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(6.dp),
    medium = RoundedCornerShape(8.dp),
    large = RoundedCornerShape(12.dp),
    extraLarge = RoundedCornerShape(16.dp),
)

/**
 * Follows the system light/dark setting. Dynamic (wallpaper) colour is off on
 * purpose so the product looks the same on every device and matches the web.
 */
@Composable
fun TaskflowaiTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val tokens = if (darkTheme) DarkTokens else LightTokens
    CompositionLocalProvider(LocalTaskflowColors provides tokens) {
        MaterialTheme(
            colorScheme = scheme(tokens, darkTheme),
            typography = Typography,
            shapes = TaskflowShapes,
            content = content,
        )
    }
}
