package com.taskflowai.taskflowai.presentation.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

private fun style(size: Int, line: Int, weight: FontWeight = FontWeight.Normal, tracking: Double = 0.0) = TextStyle(
    fontFamily = FontFamily.Default,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = line.sp,
    letterSpacing = tracking.sp,
)

/** Type scale matching the web app (20 / 16 / 15 / 14 / 13 / 12). */
val Typography = Typography(
    headlineSmall = style(22, 28, FontWeight.SemiBold, -0.2),
    titleLarge = style(20, 26, FontWeight.SemiBold, -0.2),
    titleMedium = style(16, 22, FontWeight.SemiBold),
    titleSmall = style(14, 20, FontWeight.Medium),
    bodyLarge = style(15, 22),
    bodyMedium = style(14, 20),
    bodySmall = style(13, 18),
    labelLarge = style(14, 20, FontWeight.Medium),
    labelMedium = style(12, 16, FontWeight.Medium),
    labelSmall = style(11, 14, FontWeight.Medium, 0.2),
)
