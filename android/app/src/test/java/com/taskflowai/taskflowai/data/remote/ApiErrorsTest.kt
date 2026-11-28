package com.taskflowai.taskflowai.data.remote

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ApiErrorsTest {
    @Test
    fun prefersTheFirstFieldError() {
        val body = """{"statusCode":400,"code":"VALIDATION_FAILED","message":"Validation failed.","details":{"fields":["The password must contain at least one digit."]}}"""
        assertEquals("The password must contain at least one digit.", parseErrorMessage(body))
    }

    @Test
    fun fallsBackToTheMessage() {
        assertEquals("Invalid email or password.", parseErrorMessage("""{"code":"INVALID_CREDENTIALS","message":"Invalid email or password.","details":{}}"""))
    }

    @Test
    fun ignoresBodiesThatAreNotErrorJson() {
        assertNull(parseErrorMessage(null))
        assertNull(parseErrorMessage(""))
        assertNull(parseErrorMessage("<html>Bad gateway</html>"))
    }
}
