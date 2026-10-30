package com.yugahashimoto.andcode.feature.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class GitHubTokenTest {
    @Test
    fun `token is trimmed before it is verified or stored`() {
        assertEquals("ghp_abc123", normalizeGitHubToken("  ghp_abc123\n"))
    }

    @Test
    fun `blank input is rejected`() {
        assertNull(normalizeGitHubToken(""))
        assertNull(normalizeGitHubToken("   \t\n"))
    }
}
