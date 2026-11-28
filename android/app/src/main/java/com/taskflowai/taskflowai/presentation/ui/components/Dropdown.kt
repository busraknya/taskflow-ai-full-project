package com.taskflowai.taskflowai.presentation.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.taskflowai.taskflowai.presentation.ui.theme.Taskflow

/** A labelled single-choice field, the Android counterpart of the web Select. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> Dropdown(
    label: String,
    options: List<Pair<T, String>>,
    selected: T,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    showLabel: Boolean = true,
) {
    val c = Taskflow.colors
    var expanded by remember { mutableStateOf(false) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (showLabel) Text(label, style = MaterialTheme.typography.labelLarge, color = c.fg)
        ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { if (enabled) expanded = it }) {
            OutlinedTextField(
                value = options.firstOrNull { it.first == selected }?.second.orEmpty(),
                onValueChange = {},
                readOnly = true,
                enabled = enabled,
                singleLine = true,
                label = if (showLabel) null else ({ Text(label) }),
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
                textStyle = MaterialTheme.typography.bodyLarge,
                shape = MaterialTheme.shapes.small,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = c.accent,
                    unfocusedBorderColor = c.line,
                    focusedContainerColor = c.surface,
                    unfocusedContainerColor = c.surface,
                ),
                modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable, enabled),
            )
            ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }, containerColor = c.surface) {
                options.forEach { (value, text) ->
                    DropdownMenuItem(
                        text = { Text(text, style = MaterialTheme.typography.bodyLarge, color = if (value == selected) c.accent else c.fg) },
                        onClick = {
                            expanded = false
                            if (value != selected) onSelect(value)
                        },
                    )
                }
            }
        }
    }
}
