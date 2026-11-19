package se.felixarvid.xteinkepub.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CssTest {
    private val simple = Css.Options(simplify = true)
    private val fonts = Css.Options(removeFonts = true)

    private fun run(text: String, opts: Css.Options = simple) = Css.processStylesheet(text, opts).first

    private fun assertContains(haystack: String, needle: String) =
        assertTrue("'$needle' not in '$haystack'", haystack.contains(needle))

    @Test fun commentsRemovedButNotInsideStrings() {
        assertEquals("p{content:\"/* keep */\";color:red}", run("/* a { b } */ p { content: \"/* keep */\"; color: red /* x */; }"))
    }

    @Test fun bracesInStrings() {
        val out = run("a::after{content:\"}{;\"} b{color:blue}")
        assertContains(out, "content:\"}{;\"")
        assertContains(out, "b{color:blue}")
    }

    @Test fun semicolonInUrl() {
        val out = run("p{background:url(data:image/png;base64,AAA=);color:red}", Css.Options())
        assertContains(out, "url(data:image/png;base64,AAA=)")
        assertContains(out, "color:red")
    }

    @Test fun mediaNestingAndEmptyDropping() {
        val text = "@media screen { @media (min-width:1px) { p { -webkit-x: 1 } } a{color:red} }"
        assertEquals("@media screen{\na{color:red}\n}", run(text))
        assertEquals("", run("@media print{p{-moz-foo:1}}"))
    }

    @Test fun pxPtToEm() {
        val out = run("p{font-size:16px} q{font-size:12pt} r{font-size:10px} s{font-size:14px !important}")
        assertContains(out, "p{font-size:1em}")
        assertContains(out, "q{font-size:1em}")
        assertContains(out, "r{font-size:0.63em}")
        assertContains(out, "s{font-size:0.88em !important}")
    }

    @Test fun emRoundingMatchesPython() {
        // 0.5px/16 = 0.03125 -> 0.03; 24px -> 1.5em; 0px -> 0em; -8px -> -0.5em
        val out = run("a{font-size:0.5px} b{font-size:24px} c{font-size:0px} d{font-size:-8px} e{font-size:9pt}")
        assertContains(out, "a{font-size:0.03em}")
        assertContains(out, "b{font-size:1.5em}")
        assertContains(out, "c{font-size:0em}")
        assertContains(out, "d{font-size:-0.5em}")
        assertContains(out, "e{font-size:0.75em}")
    }

    @Test fun otherFontSizesUntouched() {
        assertContains(run("p{font-size:120%}"), "font-size:120%")
    }

    @Test fun prefixedAndColumnsAndPosition() {
        val out = run(
            "p{-webkit-hyphens:auto;-epub-hyphens:auto;column-count:2;columns:2;position:fixed;top:0} q{position:relative}",
        )
        assertEquals("p{-epub-hyphens:auto;top:0}\nq{position:relative}", out)
    }

    @Test fun absoluteSizesDroppedExceptImages() {
        val out = run("div{width:300px;height:2in;max-width:50%} img{width:300px} .a svg{height:10pt}")
        assertContains(out, "div{max-width:50%}")
        assertContains(out, "img{width:300px}")
        assertContains(out, "height:10pt")
    }

    @Test fun htmlBodyMarginsZeroed() {
        val out = run("html,body{margin:10px 20px;padding-left:3em;color:#000} p{margin:5px}")
        assertContains(out.replace(", ", ","), "html,body{margin:0;padding-left:0;color:#000}")
        assertContains(out, "p{margin:5px}")
    }

    @Test fun fontFaceRemovedAndFamilyFiltered() {
        val text = "@font-face{font-family:\"Foo\";src:url(f.ttf)} " +
            "p{font-family:\"Foo\", Georgia, serif} q{font-family:\"Foo\"} r{font-family:monospace}"
        val (out, stats) = Css.processStylesheet(text, fonts)
        assertFalse(out.contains("font-face"))
        assertEquals(1, stats.fontFacesRemoved)
        assertContains(out, "p{font-family:serif}")
        assertFalse(out.contains("q{"))
        assertContains(out, "r{font-family:monospace}")
    }

    @Test fun keepCssModeLeavesValues() {
        assertEquals("p{-webkit-x:1;font-size:10px}", run("p{-webkit-x:1;font-size:10px}", Css.Options()))
    }

    @Test fun urlRewrite() {
        val opts = Css.Options(urlRewriter = { u -> if (u.endsWith(".png")) u.replace(".png", ".jpg") else null })
        val out = run(
            "a{background:url(\"a b.png\")} b{background:url(x.png)} c{background:url(x.gif)} d::after{content:\"url(x.png)\"}",
            opts,
        )
        assertContains(out, "url(\"a b.jpg\")")
        assertContains(out, "url(x.jpg)")
        assertContains(out, "url(x.gif)")
        assertContains(out, "\"url(x.png)\"")
    }

    @Test fun importRewriteAndCharsetDropped() {
        val opts = Css.Options(urlRewriter = { u -> if (u == "o.css") "n.css" else null })
        val out = run("@charset \"utf-8\"; @import \"o.css\"; @import url(z.css); p{color:red}", opts)
        assertFalse(out.contains("charset"))
        assertContains(out, "@import \"n.css\";")
        assertContains(out, "@import url(z.css);")
    }

    @Test fun keyframesKeptRawPrefixedDropped() {
        val out = run("@keyframes k{from{a:b}to{a:c}} @-webkit-keyframes k{from{a:b}}")
        assertContains(out, "@keyframes k{from{a:b}to{a:c}}")
        assertFalse(out.contains("-webkit-keyframes"))
    }

    @Test fun unterminatedInputIsSurvivable() {
        assertContains(run("p{color:red} q{color:"), "p{color:red}")
        assertEquals("p{a:b}", run("}}} ;; p{a:b"))
    }

    @Test fun styleAttr() {
        assertEquals("color:red", Css.processStyleAttr("width:100px; -webkit-x:1; color:red", simple).first)
        assertEquals("width:100px", Css.processStyleAttr("width:100px", simple, isImage = true).first)
    }

    @Test fun hugeDataUriDoesNotOverflowTheStack() {
        val big = "A".repeat(2_000_000)
        val css = "p{background:url(\"data:image/png;base64,$big\")} q{content:\"$big\"} r{color:red}"
        val opts = Css.Options(urlRewriter = { null })
        val out = Css.processStylesheet(css, opts).first
        assertContains(out, "r{color:red}")
    }
}
