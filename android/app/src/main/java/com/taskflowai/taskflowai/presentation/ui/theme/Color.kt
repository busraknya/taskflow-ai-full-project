package com.taskflowai.taskflowai.presentation.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/**
 * TaskFlow design tokens. The same values live in the web app
 * (frontend/src/app/globals.css); change both together. Every text/background
 * pair meets WCAG AA.
 */
@Immutable
data class TaskflowColors(
    val canvas: Color,
    val surface: Color,
    val subtle: Color,
    val line: Color,
    val lineStrong: Color,
    val fg: Color,
    val fgMuted: Color,
    val fgSubtle: Color,
    val accent: Color,
    val accentFg: Color,
    val accentSoft: Color,
    val danger: Color,
    val dangerSoft: Color,
    val warning: Color,
    val warningSoft: Color,
    val success: Color,
    val successSoft: Color,
)

val LightTokens = TaskflowColors(
    canvas = Color(0xFFF7F7F5),
    surface = Color(0xFFFFFFFF),
    subtle = Color(0xFFF0F0ED),
    line = Color(0xFFE4E4E0),
    lineStrong = Color(0xFFD3D3CD),
    fg = Color(0xFF1F2328),
    fgMuted = Color(0xFF5E636B),
    fgSubtle = Color(0xFF7E838A),
    accent = Color(0xFF3F5F7F),
    accentFg = Color(0xFFFFFFFF),
    accentSoft = Color(0xFFE8EEF4),
    danger = Color(0xFFA63D3A),
    dangerSoft = Color(0xFFF8EAE9),
    warning = Color(0xFF8A5F17),
    warningSoft = Color(0xFFF6EEDC),
    success = Color(0xFF2F6E4C),
    successSoft = Color(0xFFE5F0E9),
)

val DarkTokens = TaskflowColors(
    canvas = Color(0xFF17181A),
    surface = Color(0xFF1E2023),
    subtle = Color(0xFF26292D),
    line = Color(0xFF2E3136),
    lineStrong = Color(0xFF3D4147),
    fg = Color(0xFFE6E6E3),
    fgMuted = Color(0xFFA3A7AD),
    fgSubtle = Color(0xFF868A91),
    accent = Color(0xFF8AA6C1),
    accentFg = Color(0xFF14212E),
    accentSoft = Color(0xFF243240),
    danger = Color(0xFFE59591),
    dangerSoft = Color(0xFF3A2422),
    warning = Color(0xFFD8B36E),
    warningSoft = Color(0xFF382E1C),
    success = Color(0xFF8DC4A3),
    successSoft = Color(0xFF1E3128),
)
