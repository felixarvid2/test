package se.felixarvid.xteinkepub.core

/** Settings for the image conversion. */
data class ImageOptions(
    val width: Int = 480,
    val height: Int = 800,
    val quality: Int = 85,
    /** Number of gray levels: 256 (no quantizing), 16 or 4. */
    val levels: Int = 256,
    val dither: Boolean = true,
    val color: Boolean = false,
    val rotateLandscape: Boolean = false,
)

/** Settings for one conversion (same defaults as the Python CLI). */
data class ConvertOptions(
    val width: Int = 480,
    val height: Int = 800,
    val quality: Int = 85,
    val levels: Int = 256,
    val dither: Boolean = true,
    val color: Boolean = false,
    val rotateLandscape: Boolean = false,
    val keepFonts: Boolean = false,
    val keepCss: Boolean = false,
    val stripCss: Boolean = false,
) {
    fun imageOptions() = ImageOptions(width, height, quality, levels, dither, color, rotateLandscape)
}

/** Result summary of one conversion. */
data class ConversionReport(
    var sizeBefore: Long = 0,
    var sizeAfter: Long = 0,
    var imagesConverted: Int = 0,
    var imagesFailed: Int = 0,
    var fontsRemoved: Int = 0,
    var fontFacesRemoved: Int = 0,
    var cssRemoved: Int = 0,
    var svgUnwrapped: Int = 0,
    var junkRemoved: Int = 0,
    val warnings: MutableList<String> = ArrayList(),
    /** Verbose detail, one line per converted image. */
    val notes: MutableList<String> = ArrayList(),
)

enum class Stage { READING, IMAGES, FONTS, STYLES, PAGES, PACKING }

/**
 * Progress of one book. [fraction] is the overall progress 0..1; [itemIndex]/[itemCount]
 * count the units of the current [stage] (e.g. images), [itemName] names the current one.
 */
data class Progress(
    val stage: Stage,
    val fraction: Float,
    val itemIndex: Int = 0,
    val itemCount: Int = 0,
    val itemName: String? = null,
)

/**
 * Receives progress. It may throw (e.g. a CancellationException) to abort the conversion;
 * the exception propagates out of the converter.
 */
fun interface ProgressListener {
    fun onProgress(progress: Progress)
}

/**
 * Converts one raster image to a baseline JPEG that fits [ImageOptions]. Returns null when the
 * image cannot be decoded (the converter then keeps the original and adds a warning).
 */
fun interface ImageProcessor {
    fun process(bytes: ByteArray, opts: ImageOptions): ByteArray?
}
