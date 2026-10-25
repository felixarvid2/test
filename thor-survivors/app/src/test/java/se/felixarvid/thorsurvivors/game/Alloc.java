package se.felixarvid.thorsurvivors.game;

/** Bytes the current thread has allocated (HotSpot's ThreadMXBean, by reflection: android.jar has no java.lang.management). */
final class Alloc {
    private Alloc() {
    }

    static long bytes() throws Exception {
        Class<?> f = Class.forName("java.lang.management.ManagementFactory");
        Object bean = f.getMethod("getThreadMXBean").invoke(null);
        java.lang.reflect.Method m = Class.forName("com.sun.management.ThreadMXBean").getMethod("getThreadAllocatedBytes", long.class);
        m.setAccessible(true);
        return (Long) m.invoke(bean, Thread.currentThread().getId());
    }
}
