package com.taskflowai.taskflowai.presentation.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.taskflowai.taskflowai.presentation.ui.Labels
import com.taskflowai.taskflowai.presentation.ui.theme.Taskflow

enum class Tone { Neutral, Accent, Success, Warning, Danger }

@Composable
private fun toneColors(tone: Tone): Pair<Color, Color> {
    val c = Taskflow.colors
    return when (tone) {
        Tone.Neutral -> c.subtle to c.fgMuted
        Tone.Accent -> c.accentSoft to c.accent
        Tone.Success -> c.successSoft to c.success
        Tone.Warning -> c.warningSoft to c.warning
        Tone.Danger -> c.dangerSoft to c.danger
    }
}

@Composable
fun Badge(text: String, tone: Tone = Tone.Neutral) {
    val (bg, fg) = toneColors(tone)
    Text(
        text = text,
        color = fg,
        style = MaterialTheme.typography.labelMedium,
        modifier = Modifier
            .background(bg, MaterialTheme.shapes.extraSmall)
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

/** Dot colour per task status; always shown next to the status label. */
@Composable
fun statusColor(status: String): Color {
    val c = Taskflow.colors
    return when (status) {
        "IN_PROGRESS" -> c.accent
        "IN_REVIEW" -> c.warning
        "DONE" -> c.success
        else -> c.fgSubtle
    }
}

@Composable
fun StatusDot(status: String) {
    Box(Modifier.size(8.dp).background(statusColor(status), CircleShape))
}

@Composable
fun Avatar(name: String?, size: Int = 28) {
    val c = Taskflow.colors
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(size.dp)
            .background(c.subtle, CircleShape)
            .border(1.dp, c.line, CircleShape)
            .clearAndSetSemantics { },
    ) {
        Text(Labels.initials(name), color = c.fgMuted, fontSize = (size * 0.38).sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, loading: Boolean = false, enabled: Boolean = true) {
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier.height(44.dp),
        shape = MaterialTheme.shapes.small,
        contentPadding = PaddingValues(horizontal = 16.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(Modifier.size(18.dp), color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
        } else {
            Text(text, style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(44.dp),
        shape = MaterialTheme.shapes.small,
        border = BorderStroke(1.dp, Taskflow.colors.line),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = Taskflow.colors.fg),
    ) { Text(text, style = MaterialTheme.typography.labelLarge) }
}

@Composable
fun GhostButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, color: Color = Taskflow.colors.accent, enabled: Boolean = true) {
    TextButton(onClick = onClick, enabled = enabled, modifier = modifier, shape = MaterialTheme.shapes.small) {
        Text(text, color = color, style = MaterialTheme.typography.labelLarge)
    }
}

/** Label above the control, like the web forms; error replaces the hint. */
@Composable
fun FormField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    hint: String? = null,
    error: String? = null,
    singleLine: Boolean = true,
    minLines: Int = 1,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    placeholder: String? = null,
    /** Keeps the label for screen readers only (e.g. a compact comment bar). */
    hideLabel: Boolean = false,
) {
    val c = Taskflow.colors
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (!hideLabel) Text(label, style = MaterialTheme.typography.labelLarge, color = c.fg)
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth().semantics { if (hideLabel) contentDescription = label },
            singleLine = singleLine,
            minLines = minLines,
            isError = error != null,
            keyboardOptions = keyboardOptions,
            visualTransformation = visualTransformation,
            textStyle = MaterialTheme.typography.bodyLarge,
            shape = MaterialTheme.shapes.small,
            placeholder = placeholder?.let { { Text(it, color = c.fgSubtle) } },
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = c.accent,
                unfocusedBorderColor = c.line,
                focusedContainerColor = c.surface,
                unfocusedContainerColor = c.surface,
                cursorColor = c.accent,
            ),
        )
        (error ?: hint)?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = if (error != null) c.danger else c.fgMuted)
        }
    }
}

/** Inline error or confirmation, same treatment as the web Alert. */
@Composable
fun Banner(message: String?, tone: Tone = Tone.Danger) {
    if (message.isNullOrBlank()) return
    val (bg, fg) = toneColors(tone)
    Text(
        message,
        color = fg,
        style = MaterialTheme.typography.bodySmall,
        modifier = Modifier.fillMaxWidth().background(bg, MaterialTheme.shapes.small).padding(horizontal = 12.dp, vertical = 10.dp),
    )
}

@Composable
fun EmptyState(title: String, description: String? = null, action: (@Composable () -> Unit)? = null) {
    val c = Taskflow.colors
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, c.lineStrong, MaterialTheme.shapes.medium)
            .padding(horizontal = 24.dp, vertical = 40.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleSmall, color = c.fg, textAlign = TextAlign.Center)
        if (description != null) {
            Spacer(Modifier.height(6.dp))
            Text(description, style = MaterialTheme.typography.bodySmall, color = c.fgMuted, textAlign = TextAlign.Center)
        }
        if (action != null) {
            Spacer(Modifier.height(16.dp))
            action()
        }
    }
}

@Composable
fun LoadingState(label: String) {
    val c = Taskflow.colors
    Row(
        Modifier.fillMaxSize(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator(Modifier.size(16.dp), color = c.fgSubtle, strokeWidth = 2.dp)
        Spacer(Modifier.size(8.dp))
        Text(label, style = MaterialTheme.typography.bodyMedium, color = c.fgMuted)
    }
}

/** Card surface: 1dp line instead of elevation, as on the web. */
fun Modifier.cardSurface(colors: com.taskflowai.taskflowai.presentation.ui.theme.TaskflowColors, shape: androidx.compose.ui.graphics.Shape) =
    this.background(colors.surface, shape).border(1.dp, colors.line, shape)
