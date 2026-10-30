package com.yugahashimoto.andcode.feature.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Code
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.yugahashimoto.andcode.R

/** Where the user creates their own personal access token. */
private const val GITHUB_TOKENS_URL = "https://github.com/settings/tokens"

@Composable
fun GitHubSettingsScreen(
    state: SettingsUiState,
    onConnect: () -> Unit,
    onSaveToken: (String) -> Unit,
    onDisconnect: () -> Unit,
    onOpenVerification: (String) -> Unit,
    onBack: () -> Unit,
) {
    LaunchedEffect(state.githubVerificationUrl) {
        state.githubVerificationUrl?.let(onOpenVerification)
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.github_screen_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier.padding(padding).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Icon(Icons.Default.Code, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Text(stringResource(R.string.github_intro))
            Text(state.githubLogin ?: stringResource(R.string.github_not_connected))
            state.githubMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            state.githubUserCode?.let { code ->
                GithubDeviceCodeCard(code, state.githubVerificationUrl, onOpenVerification)
            } ?: if (state.githubLogin == null) {
                GitHubSignInOptions(state, onConnect, onSaveToken, onOpenVerification)
            } else {
                OutlinedButton(onClick = onDisconnect, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.github_disconnect))
                }
            }
        }
    }
}

/**
 * The ways to sign in, shared by Settings and onboarding: a personal access token the user made
 * themselves, and the OAuth device flow.
 *
 * The device flow needs a client ID, and the one a published build carries belongs to the app's
 * author, so a token is the main path. A build without a client ID has no device flow at all: its
 * button would be disabled forever, so it is hidden and a hint stands in its place.
 */
@Composable
fun GitHubSignInOptions(
    state: SettingsUiState,
    onConnect: () -> Unit,
    onSaveToken: (String) -> Unit,
    onOpenUrl: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        GitHubTokenSignIn(onSaveToken, onOpenUrl)
        if (state.githubConfigured) {
            OutlinedButton(onClick = onConnect, enabled = !state.githubPolling, modifier = Modifier.fillMaxWidth()) {
                Text(
                    if (state.githubPolling) {
                        stringResource(R.string.github_waiting_for_authorization)
                    } else {
                        stringResource(R.string.github_connect)
                    },
                )
            }
        } else {
            Text(stringResource(R.string.github_token_only_hint), style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun GitHubTokenSignIn(
    onSaveToken: (String) -> Unit,
    onOpenUrl: (String) -> Unit,
) {
    var token by rememberSaveable { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(R.string.github_token_help), style = MaterialTheme.typography.bodySmall)
        OutlinedButton(onClick = { onOpenUrl(GITHUB_TOKENS_URL) }, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.github_token_create))
        }
        OutlinedTextField(
            value = token,
            onValueChange = { token = it },
            label = { Text(stringResource(R.string.github_token_label)) },
            visualTransformation = PasswordVisualTransformation(),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = { onSaveToken(token) },
            enabled = normalizeGitHubToken(token) != null,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.github_token_save))
        }
    }
}
