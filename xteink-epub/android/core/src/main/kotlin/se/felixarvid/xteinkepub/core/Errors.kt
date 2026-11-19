package se.felixarvid.xteinkepub.core

/** The book cannot be processed. [message] is user-facing, in Swedish. */
open class EpubException(message: String, cause: Throwable? = null) : Exception(message, cause)

/** Not a zip file, or a damaged one. */
class InvalidZipException(message: String = "Filen är ingen giltig EPUB (trasigt eller inget zip-arkiv).", cause: Throwable? = null) :
    EpubException(message, cause)

/** DRM-protected book (rights.xml, or encryption other than font obfuscation). */
class DrmException(message: String) : EpubException(message)

/** META-INF/container.xml is missing or points nowhere, and no *.opf exists. */
class NoOpfException(message: String = "Hittade ingen OPF-fil (META-INF/container.xml saknas eller är fel).") :
    EpubException(message)

/** The OPF exists but cannot be understood. */
class InvalidOpfException(message: String) : EpubException(message)
