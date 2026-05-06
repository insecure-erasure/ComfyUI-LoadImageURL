import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

/**
 * Based on comfyui-load-image-url by Braeden90000
 */
app.registerExtension({
    name: "LoadImageByUrlOrPath.Preview",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "LoadImageByUrlOrPath") {

            // ========== CONFIGURABLE CONSTANTS ==========
            const MIN_NODE_WIDTH = 148;      // Minimum node width
            const MAX_NODE_WIDTH = 240;      // Maximum node width
            const MIN_NODE_HEIGHT = 200;     // Absolute minimum node height
            const PREVIEW_PADDING = 10;      // Padding around image
            const TOP_PADDING = -8;          // Padding above image (negative to compensate ComfyUI spacing)
            const BOTTOM_PADDING = 18;       // Padding below image (for dimensions text)
            const MAX_IMAGE_HEIGHT = 192;    // Maximum image height
            // ==========================================

            async function refreshTempFileList(node) {
                const imageWidget = node.widgets?.find(w => w.name === "image");
                if (!imageWidget) return;

                try {
                    const response = await fetch("/load_image_list_temp");
                    const data = await response.json();

                    if (data.files && data.files.length > 0) {
                        imageWidget.options.values = data.files;
                        // Keep current selection if still valid, otherwise select first
                        if (!data.files.includes(imageWidget.value)) {
                            imageWidget.value = data.files[0];
                        }
                    } else {
                        imageWidget.options.values = ["(no images found)"];
                        imageWidget.value = "(no images found)";
                    }
                    node.setDirtyCanvas(true, true);
                } catch (error) {
                    console.error("Error refreshing temp file list:", error);
                }
            }

            /**
             * Toggle visibility of url/image widgets based on source value.
             * Uses widget property overrides that work reliably across
             * ComfyUI/LiteGraph versions.
             */
            function setWidgetHidden(widget, hidden) {
                widget.hidden = hidden;
                if (hidden) {
                    // Store originals on first hide
                    if (widget._origComputeSize === undefined) {
                        widget._origComputeSize = widget.computeSize;
                        widget._origDraw = widget.draw;
                    }
                    widget.computeSize = () => [0, -4]; // -4 compensates LiteGraph widget spacing
                    widget.draw = () => {};
                } else if (widget._origComputeSize !== undefined) {
                    widget.computeSize = widget._origComputeSize;
                    widget.draw = widget._origDraw;
                }
            }

            function updateWidgetVisibility(node) {
                const sourceWidget = node.widgets?.find(w => w.name === "source");
                const urlWidget = node.widgets?.find(w => w.name === "url");
                const imageWidget = node.widgets?.find(w => w.name === "image");

                if (!sourceWidget || !urlWidget || !imageWidget) return;

                const isUrl = sourceWidget.value === "url";

                setWidgetHidden(urlWidget, !isUrl);
                setWidgetHidden(imageWidget, isUrl);

                // Recalculate node size
                const targetSize = node.computeSize();
                targetSize[0] = Math.max(targetSize[0], node.size[0]);
                node.setSize(targetSize);
                node.setDirtyCanvas(true, true);

                // When switching to temp_file, refresh list and auto-preview
                if (!isUrl) {
                    refreshTempFileList(node).then(() => {
                        if (imageWidget.value && imageWidget.value !== "(no images found)") {
                            node.loadPreview();
                        }
                    });
                }
            }

            // Store original onNodeCreated
            const originalOnNodeCreated = nodeType.prototype.onNodeCreated;

            nodeType.prototype.onNodeCreated = function() {
                const result = originalOnNodeCreated?.apply(this, arguments);

                // Store image dimensions for size calculation
                this._previewImgWidth = 0;
                this._previewImgHeight = 0;
                this._previewVisible = false;
                this._previewImgSrc = null;

                // Listen for source changes
                const sourceWidget = this.widgets?.find(w => w.name === "source");
                if (sourceWidget) {
                    const originalCallback = sourceWidget.callback;
                    const node = this;
                    sourceWidget.callback = function(value) {
                        if (originalCallback) originalCallback.call(this, value);
                        updateWidgetVisibility(node);
                    };
                }

                // Auto-preview when temp file selection changes
                const imageWidget = this.widgets?.find(w => w.name === "image");
                if (imageWidget) {
                    const originalImgCallback = imageWidget.callback;
                    const imgNode = this;
                    imageWidget.callback = function(value) {
                        if (originalImgCallback) originalImgCallback.call(this, value);
                        if (value && value !== "(no images found)") {
                            imgNode.loadPreview();
                        }
                    };
                }

                // Add Load button widget (after the other widgets)
                const loadButton = this.addWidget("button", "Load Preview", null, () => {
                    this.loadPreview();
                });
                loadButton.serialize = false;
                this.loadButton = loadButton;

                // Set initial visibility (defer to next frame so widgets are fully ready)
                const node = this;
                requestAnimationFrame(() => {
                    updateWidgetVisibility(node);
                    app.graph.setDirtyCanvas(true, true);
                });

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
                const yStart = widgetHeight + TOP_PADDING;
                const availableHeight = this.size[1] - yStart - BOTTOM_PADDING;
                const availableWidth = this.size[0];

                if (availableHeight <= 10) {
                    return;
                }

                // Calculate image dimensions maintaining aspect ratio
                const imgAspect = img.naturalWidth / img.naturalHeight;
                const maxWidth = availableWidth - PREVIEW_PADDING * 2;
                const maxHeight = availableHeight;

                let drawWidth, drawHeight;

                if (maxWidth / maxHeight > imgAspect) {
                    drawHeight = maxHeight;
                    drawWidth = drawHeight * imgAspect;
                } else {
                    drawWidth = maxWidth;
                    drawHeight = drawWidth / imgAspect;
                }

                const x = (availableWidth - drawWidth) / 2;
                const y = yStart;

                ctx.drawImage(img, x, y, drawWidth, drawHeight);

                // Draw dimensions text below image
                const text = `${img.naturalWidth} × ${img.naturalHeight}`;
                ctx.font = "10px Arial";
                ctx.fillStyle = "#888";
                ctx.textAlign = "center";
                ctx.fillText(text, availableWidth / 2, y + drawHeight + 14);
            };

            // Helper function to update node size based on image
            nodeType.prototype._updatePreviewSize = function() {
                if (!this._previewVisible || this._previewImgWidth <= 0) {
                    return;
                }

                const optimalWidth = Math.max(MIN_NODE_WIDTH, Math.min(this._previewImgWidth, MAX_NODE_WIDTH));
                const aspectRatio = this._previewImgHeight / this._previewImgWidth;
                const imageWidth = optimalWidth - (PREVIEW_PADDING * 2);
                const imageHeight = Math.min(imageWidth * aspectRatio, MAX_IMAGE_HEIGHT);
                const widgetsHeight = this.computeSize()[1];
                const totalHeight = widgetsHeight + TOP_PADDING + imageHeight + BOTTOM_PADDING;

                this.setSize([optimalWidth, totalHeight]);

                this.setDirtyCanvas(true, true);
                app.graph.setDirtyCanvas(true, true);
            };

            // Override setSize to prevent shrinking below minimum
            const originalSetSize = nodeType.prototype.setSize;
            nodeType.prototype.setSize = function(size) {
                if (this._previewVisible && this._previewImgWidth > 0) {
                    size[1] = Math.max(size[1], MIN_NODE_HEIGHT);
                }
                return originalSetSize.call(this, size);
            };

            // Add method to load preview
            nodeType.prototype.loadPreview = async function() {
                try {
                    const sourceWidget = this.widgets?.find(w => w.name === "source");
                    const urlWidget = this.widgets?.find(w => w.name === "url");
                    const imageWidget = this.widgets?.find(w => w.name === "image");

                    if (!sourceWidget) return;

                    const source = sourceWidget.value;
                    let payload = { source };

                    if (source === "url") {
                        if (!urlWidget || !urlWidget.value?.trim()) {
                            alert("Please enter a URL");
                            return;
                        }
                        payload.url = urlWidget.value.trim();
                    } else {
                        if (!imageWidget || !imageWidget.value || imageWidget.value === "(no images found)") {
                            alert("No temp image selected");
                            return;
                        }
                        payload.image = imageWidget.value;
                    }

                    // Clear previous preview state
                    this._previewVisible = false;
                    this._previewImgElement = null;
                    this._previewImgWidth = 0;
                    this._previewImgHeight = 0;
                    this.setDirtyCanvas(true, true);

                    // Call API endpoint
                    const response = await fetch("/load_image_preview", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(payload)
                    });

                    const data = await response.json();

                    if (data.error) {
                        alert(`Error: ${data.error}`);
                        return;
                    }

                    if (data.success && data.image) {
                        if (data.dimensions) {
                            this._previewImgWidth = data.dimensions.width;
                            this._previewImgHeight = data.dimensions.height;
                        }

                        const params = new URLSearchParams({
                            filename: data.image.filename,
                            type: data.image.type,
                            subfolder: data.image.subfolder || ""
                        });

                        const imageUrl = api.apiURL(`/view?${params.toString()}&t=${Date.now()}`);
                        const node = this;

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

                if (message?.images && message.images.length > 0) {
                    const imageData = message.images[0];

                    const params = new URLSearchParams({
                        filename: imageData.filename,
                        type: imageData.type,
                        subfolder: imageData.subfolder || ""
                    });

                    const imageUrl = api.apiURL(`/view?${params.toString()}`);
                    const node = this;

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
