// OverlayManager - runs in the overlay window's renderer process
// Draws pulsing highlight rectangles on a full-screen transparent canvas

class OverlayManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.highlights = [];
        this.animationId = null;

        this._resize();
        window.addEventListener('resize', () => this._resize());
        this._startRenderLoop();
    }

    _resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    addHighlight(x, y, width, height, label = '') {
        this.highlights.push({
            x, y, width, height, label,
            createdAt: Date.now(),
            duration: 8000, // Auto-fade after 8 seconds
        });
    }

    clearHighlights() {
        this.highlights = [];
    }

    _startRenderLoop() {
        const render = () => {
            this.animationId = requestAnimationFrame(render);
            this._render();
        };
        render();
    }

    _render() {
        const ctx = this.ctx;
        const now = Date.now();

        // Clear canvas
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Remove expired highlights
        this.highlights = this.highlights.filter(h => now - h.createdAt < h.duration);

        for (const h of this.highlights) {
            const elapsed = now - h.createdAt;
            const fadeStart = h.duration - 2000;

            let alpha = 1;
            if (elapsed > fadeStart) {
                alpha = 1 - (elapsed - fadeStart) / 2000;
            }

            // Pulsing effect
            const pulse = 0.7 + 0.3 * Math.sin(elapsed / 400);

            // Draw glow effect (outer)
            ctx.shadowColor = `rgba(66, 133, 244, ${alpha * 0.6})`;
            ctx.shadowBlur = 15;

            // Draw highlight rectangle - thick solid border
            ctx.strokeStyle = `rgba(66, 133, 244, ${alpha * pulse})`;
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
            ctx.strokeRect(h.x, h.y, h.width, h.height);

            // Reset shadow
            ctx.shadowBlur = 0;

            // Draw fill
            ctx.fillStyle = `rgba(66, 133, 244, ${alpha * 0.1})`;
            ctx.fillRect(h.x, h.y, h.width, h.height);

            // Draw corner brackets for a modern look
            const bracketSize = Math.min(20, h.width / 4, h.height / 4);
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * pulse})`;
            ctx.lineWidth = 3;

            // Top-left corner
            ctx.beginPath();
            ctx.moveTo(h.x, h.y + bracketSize);
            ctx.lineTo(h.x, h.y);
            ctx.lineTo(h.x + bracketSize, h.y);
            ctx.stroke();

            // Top-right corner
            ctx.beginPath();
            ctx.moveTo(h.x + h.width - bracketSize, h.y);
            ctx.lineTo(h.x + h.width, h.y);
            ctx.lineTo(h.x + h.width, h.y + bracketSize);
            ctx.stroke();

            // Bottom-left corner
            ctx.beginPath();
            ctx.moveTo(h.x, h.y + h.height - bracketSize);
            ctx.lineTo(h.x, h.y + h.height);
            ctx.lineTo(h.x + bracketSize, h.y + h.height);
            ctx.stroke();

            // Bottom-right corner
            ctx.beginPath();
            ctx.moveTo(h.x + h.width - bracketSize, h.y + h.height);
            ctx.lineTo(h.x + h.width, h.y + h.height);
            ctx.lineTo(h.x + h.width, h.y + h.height - bracketSize);
            ctx.stroke();

            // Draw label
            if (h.label) {
                const labelX = h.x;
                const labelY = h.y - 6;

                ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                const textMetrics = ctx.measureText(h.label);
                const textWidth = textMetrics.width;
                const padding = 8;

                // Label background with rounded corners
                ctx.fillStyle = `rgba(66, 133, 244, ${alpha * 0.95})`;
                const bgX = labelX;
                const bgY = labelY - 18;
                const bgW = textWidth + padding * 2;
                const bgH = 24;
                ctx.beginPath();
                ctx.roundRect(bgX, bgY, bgW, bgH, 6);
                ctx.fill();

                // Label text
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.fillText(h.label, labelX + padding, labelY);
            }
        }
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }
}

if (typeof window !== 'undefined') {
    window.OverlayManager = OverlayManager;
}
