import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

/**
 * Based on comfyui-load-image-url by Braeden90000
 */
app.registerExtension({
    name: "LoadImageByUrlOrPath.Preview",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "LoadImageByUrlOrPath") {

            // ========== CONSTANTES CONFIGURABLES ==========
            const MIN_NODE_WIDTH = 280;      // Ancho mínimo del nodo
            const MAX_NODE_WIDTH = 450;      // Ancho máximo del nodo
            const MIN_NODE_HEIGHT = 200;     // Altura mínima ABSOLUTA del nodo (permite redimensionar más)
            const PREVIEW_PADDING = 10;      // Padding alrededor de la imagen
            const EXTRA_HEIGHT = 5;          // Padding adicional (widgets + texto + espacio)
            const MAX_IMAGE_HEIGHT = 300;    // Altura máxima de la imagen
            // =============================================

            // Store original onNodeCreated
            const originalOnNodeCreated = nodeType.prototype.onNodeCreated;

            nodeType.prototype.onNodeCreated = function() {
                const result = originalOnNodeCreated?.apply(this, arguments);

                // Store image dimensions for size calculation
                this._previewImgWidth = 0;
                this._previewImgHeight = 0;
                this._previewVisible = false;
                this._previewImgSrc = null;

                // Add Load button widget FIRST (before preview)
                const loadButton = this.addWidget("button", "Load Preview", null, () => {
                    this.loadPreview();
                });
                loadButton.serialize = false;
                this.loadButton = loadButton;

                return result;
            };

            // Override onDrawForeground to draw image like native nodes
            const onDrawForeground = nodeType.prototype.onDrawForeground;

            nodeType.prototype.onDrawForeground = function(ctx) {
                if (onDrawForeground) {
                    onDrawForeground.apply(this, arguments);
                }

                if (!this._previewVisible || !this._previewImgElement) {
                    return;
                }

                const img = this._previewImgElement;
                if (!img.complete || img.naturalWidth === 0) {
                    return;
                }

                // Calculate available space (below widgets)
                const widgetHeight = this.computeSize()[1];
                const yStart = widgetHeight;
                const availableHeight = this.size[1] - yStart;
                const availableWidth = this.size[0];

                if (availableHeight <= 10) {
                    return;
                }

                // Calculate image dimensions maintaining aspect ratio
                const imgAspect = img.naturalWidth / img.naturalHeight;
                const maxWidth = availableWidth - PREVIEW_PADDING * 2;
                const maxHeight = availableHeight - PREVIEW_PADDING * 2;

                let drawWidth, drawHeight;

                if (maxWidth / maxHeight > imgAspect) {
                    // Height constrained
                    drawHeight = maxHeight;
                    drawWidth = drawHeight * imgAspect;
                } else {
                    // Width constrained
                    drawWidth = maxWidth;
                    drawHeight = drawWidth / imgAspect;
                }

                // Center the image
                const x = (availableWidth - drawWidth) / 2;
                const y = yStart + (availableHeight - drawHeight) / 2;

                // Draw image
                ctx.drawImage(img, x, y, drawWidth, drawHeight);

                // Draw dimensions text below image
                const text = `${img.naturalWidth} × ${img.naturalHeight}`;
                ctx.font = "10px Arial";
                ctx.fillStyle = "#888";
                ctx.textAlign = "center";
                ctx.fillText(text, availableWidth / 2, y + drawHeight + 12);
            };

            // Helper function to update node size based on image
            nodeType.prototype._updatePreviewSize = function() {
                if (!this._previewVisible || this._previewImgWidth <= 0) {
                    return;
                }

                // Calculate optimal width
                const optimalWidth = Math.max(MIN_NODE_WIDTH, Math.min(this._previewImgWidth, MAX_NODE_WIDTH));

                // Calculate the height needed for the image at this width
                const aspectRatio = this._previewImgHeight / this._previewImgWidth;
                const imageWidth = optimalWidth - (PREVIEW_PADDING * 2);
                const imageHeight = Math.min(imageWidth * aspectRatio, MAX_IMAGE_HEIGHT);

                // Get widgets height
                const widgetsHeight = this.computeSize()[1];

                // Total height = widgets + image + extra padding
                const totalHeight = widgetsHeight + imageHeight + EXTRA_HEIGHT;

                this.setSize([optimalWidth, totalHeight]);

                this.setDirtyCanvas(true, true);
                app.graph.setDirtyCanvas(true, true);
            };

            // Override setSize to prevent shrinking below minimum
            const originalSetSize = nodeType.prototype.setSize;
            nodeType.prototype.setSize = function(size) {
                if (this._previewVisible && this._previewImgWidth > 0) {
                    // Enforce minimum height (absolute, not based on image)
                    size[1] = Math.max(size[1], MIN_NODE_HEIGHT);
                }
                return originalSetSize.call(this, size);
            };

            // Add method to load preview
            nodeType.prototype.loadPreview = async function() {
                try {
                    const urlOrPathWidget = this.widgets?.find(w => w.name === "url_or_path");

                    if (!urlOrPathWidget || !urlOrPathWidget.value?.trim()) {
                        alert("Please enter a URL or path");
                        return;
                    }

                    // Clear previous preview state
                    this._previewVisible = false;
                    this._previewImgElement = null;
                    this._previewImgWidth = 0;
                    this._previewImgHeight = 0;
                    this.setDirtyCanvas(true, true);

                    const urlOrPath = urlOrPathWidget.value.trim();

                    // Call API endpoint
                    const response = await fetch("/load_image_preview", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            url_or_path: urlOrPath
                        })
                    });

                    const data = await response.json();

                    if (data.error) {
                        alert(`Error: ${data.error}`);
                        return;
                    }

                    if (data.success && data.image) {
                        // Store dimensions for computeSize
                        if (data.dimensions) {
                            this._previewImgWidth = data.dimensions.width;
                            this._previewImgHeight = data.dimensions.height;
                        }

                        // Build image URL with cache buster
                        const params = new URLSearchParams({
                            filename: data.image.filename,
                            type: data.image.type,
                            subfolder: data.image.subfolder || ""
                        });

                        const imageUrl = api.apiURL(`/view?${params.toString()}&t=${Date.now()}`);
                        const node = this;

                        // Create image element for canvas drawing
                        const img = new Image();
                        img.onload = () => {
                            if (!data.dimensions) {
                                node._previewImgWidth = img.naturalWidth;
                                node._previewImgHeight = img.naturalHeight;
                            }
                            node._previewImgElement = img;
                            node._previewVisible = true;
                            node._updatePreviewSize();
                        };

                        img.onerror = () => {
                            console.error("Failed to load preview image");
                            node._previewVisible = false;
                            node._previewImgWidth = 0;
                            node._previewImgHeight = 0;
                            node.setDirtyCanvas(true, true);
                        };

                        img.src = imageUrl;
                    }

                } catch (error) {
                    console.error("Error loading preview:", error);
                    alert(`Error loading preview: ${error.message}`);
                }
            };

            // Store original onExecuted
            const onExecuted = nodeType.prototype.onExecuted;

            nodeType.prototype.onExecuted = function(message) {
                const result = onExecuted?.apply(this, arguments);

                // Update preview when node executes
                if (message?.images && message.images.length > 0) {
                    const imageData = message.images[0];

                    // Build image URL
                    const params = new URLSearchParams({
                        filename: imageData.filename,
                        type: imageData.type,
                        subfolder: imageData.subfolder || ""
                    });

                    const imageUrl = api.apiURL(`/view?${params.toString()}`);
                    const node = this;

                    // Create image element for canvas drawing
                    const img = new Image();
                    img.onload = () => {
                        node._previewImgWidth = img.naturalWidth;
                        node._previewImgHeight = img.naturalHeight;
                        node._previewImgElement = img;
                        node._previewVisible = true;
                        node._updatePreviewSize();
                    };

                    img.onerror = () => {
                        console.error("Failed to load preview image");
                        node._previewVisible = false;
                    };

                    img.src = imageUrl;
                }

                return result;
            };
        }
    }
});
