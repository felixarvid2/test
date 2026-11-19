package se.felixarvid.xteinkepub

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.performScrollToNode
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35])
class MainActivityTest {
    @get:Rule
    val rule = createAndroidComposeRule<MainActivity>()

    private fun scrollTo(text: String) {
        rule.onNode(hasScrollAction()).performScrollToNode(hasText(text))
        rule.onNodeWithText(text).assertIsDisplayed()
    }

    @Test fun mainScreenRenders() {
        rule.onNodeWithText("Välj EPUB-filer").assertIsDisplayed().assertIsEnabled()
        rule.onNodeWithText("Xteink EPUB").assertIsDisplayed()
        rule.onNodeWithText("Konvertera").assertIsDisplayed()
        scrollTo("Välj mapp för färdiga böcker")
        scrollTo("Inställningar")
        scrollTo("Konvertera direkt när böcker delas till appen")
    }
}
