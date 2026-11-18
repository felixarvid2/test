import unittest

from helpers import *  # noqa: F401,F403  (sets sys.path)
from xteink_epub import css

SIMPLE = css.CssOptions(simplify=True)
FONTS = css.CssOptions(remove_fonts=True)


def run(text, opts=SIMPLE):
    return css.process_stylesheet(text, opts)[0]


class CssTests(unittest.TestCase):
    def test_comments_removed_but_not_inside_strings(self):
        out = run('/* a { b } */ p { content: "/* keep */"; color: red /* x */; }')
        self.assertEqual(out, 'p{content:"/* keep */";color:red}')

    def test_braces_in_strings(self):
        out = run('a::after{content:"}{;"} b{color:blue}')
        self.assertIn('content:"}{;"', out)
        self.assertIn("b{color:blue}", out)

    def test_semicolon_in_url(self):
        out = run("p{background:url(data:image/png;base64,AAA=);color:red}", css.CssOptions())
        self.assertIn("url(data:image/png;base64,AAA=)", out)
        self.assertIn("color:red", out)

    def test_media_nesting_and_empty_dropping(self):
        text = "@media screen { @media (min-width:1px) { p { -webkit-x: 1 } } a{color:red} }"
        out = run(text)
        self.assertEqual(out, "@media screen{\na{color:red}\n}")
        self.assertEqual(run("@media print{p{-moz-foo:1}}"), "")

    def test_px_pt_to_em(self):
        out = run("p{font-size:16px} q{font-size:12pt} r{font-size:10px} s{font-size:14px !important}")
        self.assertIn("p{font-size:1em}", out)
        self.assertIn("q{font-size:1em}", out)
        self.assertIn("r{font-size:0.63em}", out)
        self.assertIn("s{font-size:0.88em !important}", out)

    def test_other_font_sizes_untouched(self):
        self.assertIn("font-size:120%", run("p{font-size:120%}"))

    def test_prefixed_and_columns_and_position(self):
        out = run("p{-webkit-hyphens:auto;-epub-hyphens:auto;column-count:2;columns:2;"
                  "position:fixed;top:0} q{position:relative}")
        self.assertEqual(out, "p{-epub-hyphens:auto;top:0}\nq{position:relative}")

    def test_absolute_sizes_dropped_except_images(self):
        out = run("div{width:300px;height:2in;max-width:50%} img{width:300px} .a svg{height:10pt}")
        self.assertIn("div{max-width:50%}", out)
        self.assertIn("img{width:300px}", out)
        self.assertIn("height:10pt", out)

    def test_html_body_margins_zeroed(self):
        out = run("html,body{margin:10px 20px;padding-left:3em;color:#000} p{margin:5px}")
        self.assertIn("html,body{margin:0;padding-left:0;color:#000}", out.replace(", ", ","))
        self.assertIn("p{margin:5px}", out)

    def test_font_face_removed_and_family_filtered(self):
        text = ('@font-face{font-family:"Foo";src:url(f.ttf)} '
                'p{font-family:"Foo", Georgia, serif} q{font-family:"Foo"} '
                'r{font-family:monospace}')
        out, stats = css.process_stylesheet(text, FONTS)
        self.assertNotIn("font-face", out)
        self.assertEqual(stats.font_faces_removed, 1)
        self.assertIn("p{font-family:serif}", out)
        self.assertNotIn("q{", out)
        self.assertIn("r{font-family:monospace}", out)

    def test_keep_css_mode_leaves_values(self):
        out = run("p{-webkit-x:1;font-size:10px}", css.CssOptions())
        self.assertEqual(out, "p{-webkit-x:1;font-size:10px}")

    def test_url_rewrite(self):
        fn = lambda u: u.replace(".png", ".jpg") if u.endswith(".png") else None  # noqa: E731
        opts = css.CssOptions(url_rewriter=fn)
        out = run('a{background:url("a b.png")} b{background:url(x.png)} c{background:url(x.gif)}'
                  ' d::after{content:"url(x.png)"}', opts)
        self.assertIn('url("a b.jpg")', out)
        self.assertIn("url(x.jpg)", out)
        self.assertIn("url(x.gif)", out)
        self.assertIn('"url(x.png)"', out)

    def test_import_rewrite_and_charset_dropped(self):
        opts = css.CssOptions(url_rewriter=lambda u: "n.css" if u == "o.css" else None)
        out = run('@charset "utf-8"; @import "o.css"; @import url(z.css); p{color:red}', opts)
        self.assertNotIn("charset", out)
        self.assertIn('@import "n.css";', out)
        self.assertIn("@import url(z.css);", out)

    def test_keyframes_kept_raw_prefixed_dropped(self):
        out = run("@keyframes k{from{a:b}to{a:c}} @-webkit-keyframes k{from{a:b}}")
        self.assertIn("@keyframes k{from{a:b}to{a:c}}", out)
        self.assertNotIn("-webkit-keyframes", out)

    def test_unterminated_input_is_survivable(self):
        self.assertIn("p{color:red}", run("p{color:red} q{color:"))
        self.assertEqual(run("}}} ;; p{a:b"), "p{a:b}")

    def test_style_attr(self):
        out, st = css.process_style_attr("width:100px; -webkit-x:1; color:red", SIMPLE)
        self.assertEqual(out, "color:red")
        out, _ = css.process_style_attr("width:100px", SIMPLE, is_image=True)
        self.assertEqual(out, "width:100px")


if __name__ == "__main__":
    unittest.main()
