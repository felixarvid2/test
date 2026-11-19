package se.felixarvid.xteinkepub.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RefsTest {
    @Test fun resolve() {
        assertEquals("OEBPS/img/a b.png", resolveRef("../img/a%20b.png#x", "OEBPS/css/s.css"))
        assertNull(resolveRef("http://x/y.png", "a.xhtml"))
        assertNull(resolveRef("#frag", "a.xhtml"))
        assertNull(resolveRef("../../x.png", "a.xhtml"))
        assertEquals("x.png", resolveRef("x.png", "a.xhtml"))
        assertEquals("img/x.png", resolveRef("/img/x.png", "OEBPS/a.xhtml"))
        assertEquals("OEBPS/x.png", resolveRef("x.png?v=1#a", "OEBPS/a.xhtml"))
        assertNull(resolveRef("//cdn/x.png", "a.xhtml"))
        assertNull(resolveRef("data:image/png;base64,AAAA", "a.xhtml"))
        assertNull(resolveRef("", "a.xhtml"))
    }

    @Test fun quoteAndUnquoteMatchPython() {
        assertEquals("img/my%20anim.jpg", quote("img/my anim.jpg"))
        assertEquals("%C3%A5%C3%A4%C3%B6.jpg", quote("åäö.jpg"))
        assertEquals("a-b_c.d~e/f", quote("a-b_c.d~e/f"))
        assertEquals("åäö b", unquote("%C3%A5%C3%A4%C3%B6%20b"))
        assertEquals("100%", unquote("100%"))
        assertEquals("%zz", unquote("%zz"))
        assertEquals("x y", unquote("x%20y"))
    }

    @Test fun normpath() {
        assertEquals("a/c", normpath("a/b/../c"))
        assertEquals("a", normpath("./a//"))
        assertEquals(".", normpath(""))
        assertEquals("../x", normpath("../x"))
    }

    @Test fun relative() {
        assertEquals("img/cover.jpg", relativeRef("OEBPS/img/cover.jpg", "OEBPS/ch1.xhtml"))
        assertEquals("../img/small.jpg", relativeRef("OEBPS/img/small.jpg", "OEBPS/css/style.css"))
        assertEquals("small.jpg", relativeRef("OEBPS/img/small.jpg", "OEBPS/img/vector.svg"))
        assertEquals("OEBPS/a.jpg", relativeRef("OEBPS/a.jpg", "content.opf"))
    }

    @Test fun rewriterKeepsFragmentsAndEncodes() {
        val rw = RefRewriter(mapOf("OEBPS/img/my anim.gif" to "OEBPS/img/my anim.jpg"))
        assertEquals("img/my%20anim.jpg#top", rw.rewrite("img/my%20anim.gif#top", "OEBPS/ch1.xhtml"))
        assertEquals("/OEBPS/img/my%20anim.jpg", rw.rewrite("/OEBPS/img/my%20anim.gif", "OEBPS/ch1.xhtml"))
        assertNull(rw.rewrite("img/other.gif", "OEBPS/ch1.xhtml"))
        assertNull(rw.rewrite("http://x/my%20anim.gif", "OEBPS/ch1.xhtml"))
    }
}
