/**
 * Debug Exporter - Collects logs and profiling data for debugging
 * Captures console logs, performance metrics, and system info
 */
class DebugExporter {
  constructor(tracker) {
    this.tracker = tracker;
    this.logs = [];
    this.maxLogs = 1000; // Keep last 1000 log entries
    this.startTime = Date.now();

    // Intercept console methods
    this.setupConsoleCapture();
  }

  /**
   * Intercept console methods to capture logs
   */
  setupConsoleCapture() {
    const originalConsole = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      info: console.info.bind(console)
    };

    const captureLog = (level, args) => {
      const timestamp = Date.now() - this.startTime;
      const message = Array.from(args).map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');

      this.logs.push({
        timestamp,
        level,
        message
      });

      // Keep only the last maxLogs entries
      if (this.logs.length > this.maxLogs) {
        this.logs.shift();
      }
    };

    console.log = (...args) => {
      originalConsole.log(...args);
      captureLog('log', args);
    };

    console.warn = (...args) => {
      originalConsole.warn(...args);
      captureLog('warn', args);
    };

    console.error = (...args) => {
      originalConsole.error(...args);
      captureLog('error', args);
    };

    console.info = (...args) => {
      originalConsole.info(...args);
      captureLog('info', args);
    };
  }

  /**
   * Collect system information
   */
  getSystemInfo() {
    const nav = navigator;
    const screen = window.screen;

    return {
      userAgent: nav.userAgent,
      platform: nav.platform,
      language: nav.language,
      languages: nav.languages ? Array.from(nav.languages) : [],
      cookieEnabled: nav.cookieEnabled,
      onLine: nav.onLine,
      hardwareConcurrency: nav.hardwareConcurrency || 'unknown',
      deviceMemory: nav.deviceMemory || 'unknown',
      maxTouchPoints: nav.maxTouchPoints || 0,
      screenWidth: screen.width,
      screenHeight: screen.height,
      screenAvailWidth: screen.availWidth,
      screenAvailHeight: screen.availHeight,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth,
      orientation: screen.orientation?.type || 'unknown',
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      timestamp: new Date().toISOString(),
      sessionDuration: Math.round((Date.now() - this.startTime) / 1000)
    };
  }

  /**
   * Collect tracker state information
   */
  getTrackerState() {
    if (!this.tracker) {
      return { error: 'Tracker not available' };
    }

    const state = this.tracker.state;
    return {
      isProcessing: state.isProcessing,
      isTracking: state.isTracking,
      fps: state.fps,
      useOpticalFlow: state.useOpticalFlow,
      detectionInterval: state.detectionInterval,
      frameCount: state.frameCount,
      maxFeatures: state.maxFeatures,
      maxDimension: state.maxDimension,
      visualizeFlowPoints: state.visualizeFlowPoints,
      drawKeypoints: state.drawKeypoints,
      activeVideoTarget: state.activeVideoTarget,
      trackedTargetsCount: state.trackedTargets?.size || 0
    };
  }

  /**
   * Collect camera information
   */
  getCameraInfo() {
    if (!this.tracker?.camera) {
      return { error: 'Camera not available' };
    }

    const camera = this.tracker.camera;
    return {
      isInitialized: camera.isInitialized || false,
      resolution: camera.currentResolution || 'unknown',
      facingMode: camera.facingMode || 'unknown'
    };
  }

  /**
   * Collect reference manager information
   */
  getReferenceInfo() {
    if (!this.tracker?.referenceManager) {
      return { error: 'Reference manager not available' };
    }

    const refMgr = this.tracker.referenceManager;
    const targets = refMgr.getTargetSummaries();

    return {
      targetCount: targets.length,
      usingDatabase: refMgr.usingDatabase || false,
      targets: targets.map(t => ({
        id: t.id,
        label: t.label,
        featureCount: t.featureCount || t.numFeatures || 0,
        status: t.runtime?.status || 'idle'
      }))
    };
  }

  /**
   * Collect performance profiling data
   */
  getProfilingData() {
    if (!this.tracker?.profiler) {
      return { error: 'Profiler not available' };
    }

    return this.tracker.profiler.getMetrics();
  }

  /**
   * Generate complete debug report
   */
  generateDebugReport() {
    const report = {
      metadata: {
        appName: 'Stories AR',
        reportGeneratedAt: new Date().toISOString(),
        sessionDuration: Math.round((Date.now() - this.startTime) / 1000)
      },
      systemInfo: this.getSystemInfo(),
      trackerState: this.getTrackerState(),
      cameraInfo: this.getCameraInfo(),
      referenceInfo: this.getReferenceInfo(),
      profilingData: this.getProfilingData(),
      logs: this.logs.slice(-500) // Include last 500 logs
    };

    return report;
  }

  /**
   * Generate formatted text report for display
   */
  generateTextReport() {
    const report = this.generateDebugReport();

    let text = '=== Stories AR Debug Report ===\n\n';

    text += '# METADATA\n';
    text += `Generated: ${report.metadata.reportGeneratedAt}\n`;
    text += `Session Duration: ${report.metadata.sessionDuration}s\n\n`;

    text += '# SYSTEM INFO\n';
    const sys = report.systemInfo;
    text += `User Agent: ${sys.userAgent}\n`;
    text += `Platform: ${sys.platform}\n`;
    text += `Language: ${sys.language}\n`;
    text += `Screen: ${sys.screenWidth}x${sys.screenHeight}\n`;
    text += `Window: ${sys.windowWidth}x${sys.windowHeight}\n`;
    text += `Device Pixel Ratio: ${sys.devicePixelRatio}\n`;
    text += `Orientation: ${sys.orientation}\n`;
    text += `CPU Cores: ${sys.hardwareConcurrency}\n`;
    text += `Device Memory: ${sys.deviceMemory}GB\n`;
    text += `Max Touch Points: ${sys.maxTouchPoints}\n`;
    text += `Online: ${sys.onLine}\n\n`;

    text += '# TRACKER STATE\n';
    const state = report.trackerState;
    text += `Tracking: ${state.isTracking}\n`;
    text += `Processing: ${state.isProcessing}\n`;
    text += `FPS: ${state.fps}\n`;
    text += `Optical Flow: ${state.useOpticalFlow}\n`;
    text += `Detection Interval: ${state.detectionInterval}\n`;
    text += `Frame Count: ${state.frameCount}\n`;
    text += `Max Features: ${state.maxFeatures}\n`;
    text += `Tracked Targets: ${state.trackedTargetsCount}\n\n`;

    text += '# CAMERA INFO\n';
    const cam = report.cameraInfo;
    text += `Initialized: ${cam.isInitialized}\n`;
    text += `Resolution: ${cam.resolution}\n`;
    text += `Facing Mode: ${cam.facingMode}\n\n`;

    text += '# REFERENCE INFO\n';
    const ref = report.referenceInfo;
    text += `Using Database: ${ref.usingDatabase}\n`;
    text += `Target Count: ${ref.targetCount}\n`;
    if (ref.targets && ref.targets.length > 0) {
      text += 'Targets:\n';
      ref.targets.forEach(t => {
        text += `  - ${t.label || t.id}: ${t.featureCount} features, ` +
                `status=${t.status}\n`;
      });
    }
    text += '\n';

    text += '# PERFORMANCE METRICS\n';
    const prof = report.profilingData;
    if (prof.error) {
      text += `Error: ${prof.error}\n`;
    } else {
      const metrics = Object.entries(prof)
        .sort((a, b) => b[1].avg - a[1].avg);

      for (const [label, data] of metrics) {
        text += `\n${label}:\n`;
        text += `  Avg: ${data.avg.toFixed(2)}ms ` +
                `(Recent: ${data.recentAvg.toFixed(2)}ms)\n`;
        text += `  Min: ${data.min.toFixed(2)}ms | ` +
                `Max: ${data.max.toFixed(2)}ms\n`;
        text += `  Count: ${data.count} | ` +
                `Total: ${data.total.toFixed(2)}ms\n`;
      }
    }
    text += '\n';

    text += '# CONSOLE LOGS (Last 100)\n';
    const recentLogs = report.logs.slice(-100);
    recentLogs.forEach(log => {
      const time = (log.timestamp / 1000).toFixed(2);
      text += `[${time}s] [${log.level.toUpperCase()}] ${log.message}\n`;
    });

    return text;
  }

  /**
   * Download debug report as JSON file
   */
  downloadJSON() {
    const report = this.generateDebugReport();
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '-').slice(0, -5);
    const filename = `stories-ar-debug-${timestamp}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);

    return filename;
  }

  /**
   * Download debug report as text file
   */
  downloadText() {
    const text = this.generateTextReport();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '-').slice(0, -5);
    const filename = `stories-ar-debug-${timestamp}.txt`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);

    return filename;
  }

  /**
   * Copy debug report to clipboard
   */
  async copyToClipboard() {
    const text = this.generateTextReport();

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);

      // Fallback: try using textarea method
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return success;
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr);
        return false;
      }
    }
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.DebugExporter = DebugExporter;
}
