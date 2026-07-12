/**
 * Author: Gery Casiez
 * Details: https://gery.casiez.net/1euro/
 */
class LowPassFilter {
  setAlpha(alpha) {
    if (alpha <= 0.0 || alpha > 1.0)
      console.log("alpha should be in (0.0., 1.0]");
    this.a = alpha;
  }

  constructor(alpha, initval = 0.0) {
    this.y = this.s = initval;
    this.setAlpha(alpha);
    this.initialized = false;
  }

  filter(value) {
    let result;
    if (this.initialized) result = this.a * value + (1.0 - this.a) * this.s;
    else {
      result = value;
      this.initialized = true;
    }
    this.y = value;
    this.s = result;
    return result;
  }

  filterWithAlpha(value, alpha) {
    this.setAlpha(alpha);
    return this.filter(value);
  }

  hasLastRawValue() {
    return this.initialized;
  }

  lastRawValue() {
    return this.y;
  }
  lastFilteredValue() {
    return this.s;
  }
}

class OneEuroFilter {
  alpha(cutoff) {
    const te = 1.0 / this.freq;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  constructor(freq, mincutoff = 1.0, beta_ = 0.0, dcutoff = 1.0) {
    this.freq = freq;
    this.mincutoff = mincutoff;
    this.beta_ = beta_;
    this.dcutoff = dcutoff;
    this.x = new LowPassFilter(this.alpha(mincutoff));
    this.dx = new LowPassFilter(this.alpha(dcutoff));
    this.lasttime = undefined;
  }

  filter(value, timestamp = undefined) {
    // Update the sampling frequency based on timestamps
    if (
      this.lasttime !== undefined &&
      timestamp !== undefined &&
      timestamp > this.lasttime
    )
      this.freq = 1.0 / (timestamp - this.lasttime);
    this.lasttime = timestamp;

    // Estimate the current variation per second
    const dvalue = this.x.hasLastRawValue() ? (value - this.x.lastFilteredValue()) * this.freq : 0.0;
    const edvalue = this.dx.filterWithAlpha(dvalue, this.alpha(this.dcutoff));

    // Use it to update the cutoff frequency
    const cutoff = this.mincutoff + this.beta_ * Math.abs(edvalue);

    // Filter the given value
    return this.x.filterWithAlpha(value, this.alpha(cutoff));
  }
}

/**
 * 2D One Euro Filter - uses true 2D velocity magnitude for cutoff calculation.
 * This avoids axis-aligned bias where circles become squares.
 */
class OneEuroFilter2D {
  alpha(cutoff) {
    const te = 1.0 / this.freq;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  constructor(freq, mincutoff = 1.0, beta_ = 0.0, dcutoff = 1.0) {
    this.freq = freq;
    this.mincutoff = mincutoff;
    this.beta_ = beta_;
    this.dcutoff = dcutoff;
    this.xFilter = new LowPassFilter(this.alpha(mincutoff));
    this.yFilter = new LowPassFilter(this.alpha(mincutoff));
    this.dxFilter = new LowPassFilter(this.alpha(dcutoff));
    this.dyFilter = new LowPassFilter(this.alpha(dcutoff));
    this.lasttime = undefined;
  }

  filter(x, y, timestamp = undefined) {
    if (
      this.lasttime !== undefined &&
      timestamp !== undefined &&
      timestamp > this.lasttime
    )
      this.freq = 1.0 / (timestamp - this.lasttime);
    this.lasttime = timestamp;

    // Estimate per-axis velocity
    const dxVal = this.xFilter.hasLastRawValue() ? (x - this.xFilter.lastFilteredValue()) * this.freq : 0.0;
    const dyVal = this.yFilter.hasLastRawValue() ? (y - this.yFilter.lastFilteredValue()) * this.freq : 0.0;

    // Smooth per-axis velocity
    const edx = this.dxFilter.filterWithAlpha(dxVal, this.alpha(this.dcutoff));
    const edy = this.dyFilter.filterWithAlpha(dyVal, this.alpha(this.dcutoff));

    // Compute true 2D speed magnitude
    const speed2D = Math.sqrt(edx * edx + edy * edy);

    // Single cutoff from 2D speed, applied to both axes
    const cutoff = this.mincutoff + this.beta_ * speed2D;
    const a = this.alpha(cutoff);

    const filteredX = this.xFilter.filterWithAlpha(x, a);
    const filteredY = this.yFilter.filterWithAlpha(y, a);

    return { x: filteredX, y: filteredY };
  }
}

// Make filters available globally
window.OneEuroFilter = OneEuroFilter;
window.OneEuroFilter2D = OneEuroFilter2D;