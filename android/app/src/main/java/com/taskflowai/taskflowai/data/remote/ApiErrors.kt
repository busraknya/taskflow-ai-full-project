package com.taskflowai.taskflowai.data.remote

import com.google.gson.Gson
import com.google.gson.JsonObject
import retrofit2.Response

/**
 * The message to show for a failed response. The API returns
 * { code, message, details: { fields: [...] } }; the first field error is the
 * most specific, then the message.
 */
fun Response<*>.errorMessage(fallback: String): String = parseErrorMessage(errorBody()?.string()) ?: fallback

internal fun parseErrorMessage(body: String?): String? {
    if (body.isNullOrBlank()) return null
    return runCatching {
        val json = Gson().fromJson(body, JsonObject::class.java)
        val fields = json.getAsJsonObject("details")?.getAsJsonArray("fields")
        val first = fields?.firstOrNull { it.isJsonPrimitive }?.asString
        first ?: json.get("message")?.takeIf { it.isJsonPrimitive }?.asString
    }.getOrNull()?.takeIf { it.isNotBlank() }
}
