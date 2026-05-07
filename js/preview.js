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
            const MIN_NODE_WIDTH = 148;
            const MAX_NODE_WIDTH = 240;
            const MIN_NODE_HEIGHT = 200;
            const PREVIEW_PADDING = 10;
            const TOP_PADDING = -8;
            const BOTTOM_PADDING = 18;
            const MAX_IMAGE_HEIGHT = 192;
            // ==========================================

            /**
             * Hide or show a widget by overriding its computeSize and draw.
             */
            function setWidgetHidden(widget, hidden) {
                if (hidden) {
                    if (!widget._isHidden) {
                        widget._origComputeSize = widget.computeSize?.bind(widget);
                        widget._origDraw = widget.draw?.bind(widget);
                        widget._isHidden = true;
                    }
                    widget.computeSize = () => [0, -4];
                    widget.draw = () => {};
                } else {
                    if (widget._isHidden) {
                        if (widget._origComputeSize) widget.computeSize = widget._origComputeSize;
                        else delete widget.computeSize;
                        if (widget._origDraw) widget.draw = widget._origDraw;
                        else delete widget.draw;
                        widget._isHidden = false;
                    }
                }
            }

            /**
             * Fetch the file list for the given folder from the server
             * and update the image combo widget.
             */
            async function refreshFileList(node) {
                const sourceWidget = node.widgets?.find(w => w.name === "source");
                const imageWidget = node.widgets?.find(w => w.name === "image");
                if (!sourceWidget || !imageWidget) return;

                const folder = sourceWidget.value;
                if (folder === "url") return;

                try {
                    const response = await fetch(`/load_image_list_folder?folder=${folder}`);
                    const data = await response.json();

                    if (data.files && data.files.length > 0) {
                        imageWidget.options.values = data.files;
                        if (!data.files.includes(imageWidget.value)) {
                            imageWidget.value = data.files[0];
                        }
                    } else {
                        imageWidget.options.values = ["(no images found)"];
                        imageWidget.value = "(no images found)";
                    }
                    node.setDirtyCanvas(true, true);
                } catch (error) {
                    console.error("Error refreshing file list:", error);
                }
            }

            /**
             * Destroy the current preview image element and clear all
             * preview state so the canvas is repainted clean.
             */
            function clearPreview(node) {
                if (node._previewImgElement) {
                    node._previewImgElement.src = "";
                    node._previewImgElement = null;
                }
                node._previewVisible = false;
                node._previewImgWidth = 0;
                node._previewImgHeight = 0;
                node.setDirtyCanvas(true, true);
                app.graph.setDirtyCanvas(true, true);
            }

            /**
             * Toggle visibility of url/image widgets based on source value.
             */
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

                // When switching to a folder source, refresh list and auto-preview
                if (!isUrl) {
                    refreshFileList(node).then(() => {
                        if (imageWidget.value && imageWidget.value !== "(no images found)") {
                            node.loadPreview();
                        }
                    });
                } else {
                    // Re-preview when switching back to url mode using last confirmed URL
                    if (node._lastConfirmedUrl) {
                        urlWidget.value = node._lastConfirmedUrl;
                        node.loadPreview();
                    }
                }
            }

            // Store original onNodeCreated
            const originalOnNodeCreated = nodeType.prototype.onNodeCreated;

            nodeType.prototype.onNodeCreated = function() {
                const result = originalOnNodeCreated?.apply(this, arguments);

                // Preview state
                this._previewImgWidth = 0;
                this._previewImgHeight = 0;
                this._previewVisible = false;
                this._previewImgSrc = null;
                this._lastConfirmedUrl = null;

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

                // Auto-preview when file selection changes
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

                // Auto-preview when URL is confirmed (Enter / focus lost)
                const urlWidget = this.widgets?.find(w => w.name === "url");
                if (urlWidget) {
                    const originalUrlCallback = urlWidget.callback;
                    const urlNode = this;
                    urlWidget.callback = function(value) {
                        if (originalUrlCallback) originalUrlCallback.call(this, value);
                        if (value && value.trim()) {
                            urlNode._lastConfirmedUrl = value.trim();
                            urlNode.loadPreview();
                        }
                    };
                }

                // File upload button: opens a file picker, uploads to ComfyUI input,
                // switches source to input and selects the uploaded file
                const uploadButton = this.addWidget("button", "Choose file to upload", null, () => {
                    const fileInput = document.createElement("input");
                    fileInput.type = "file";
                    fileInput.accept = "image/*";
                    fileInput.style.display = "none";
                    document.body.appendChild(fileInput);

                    fileInput.onchange = async () => {
                        const file = fileInput.files?.[0];
                        document.body.removeChild(fileInput);
                        if (!file) return;

                        try {
                            const formData = new FormData();
                            formData.append("image", file, file.name);
                            formData.append("type", "input");
                            formData.append("overwrite", "false");

                            const response = await fetch("/upload/image", {
                                method: "POST",
                                body: formData,
                            });

                            if (!response.ok) {
                                const err = await response.text();
                                alert(`Upload failed: ${err}`);
                                return;
                            }

                            const data = await response.json();
                            // data.name may include a subfolder prefix (e.g. "subdir/file.png")
                            // We only want the basename for the combo widget
                            const uploadedName = data.name.split("/").pop().split("\\").pop();

                            // Switch source to input
                            const sourceWidget = this.widgets?.find(w => w.name === "source");
                            const imageWidget = this.widgets?.find(w => w.name === "image");
                            if (!sourceWidget || !imageWidget) return;

                            sourceWidget.value = "input";

                            // Refresh file list, then force-select the uploaded file
                            await refreshFileList(this);

                            // Ensure the uploaded file is in the list even if
                            // refreshFileList did not find it yet
                            if (!imageWidget.options.values.includes(uploadedName)) {
                                imageWidget.options.values.unshift(uploadedName);
                            }
                            imageWidget.value = uploadedName;

                            // Sync visibility and trigger preview
                            updateWidgetVisibility(this);

                        } catch (error) {
                            console.error("Error uploading file:", error);
                            alert(`Error uploading file: ${error.message}`);
                        }
                    };

                    fileInput.click();
                });
                uploadButton.serialize = false;

                // Set initial visibility
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

                if (this.flags?.collapsed) return;

                if (!this._previewVisible || !this._previewImgElement) {
                    return;
                }

                const img = this._previewImgElement;
                if (!img.complete || img.naturalWidth === 0) {
                    return;
                }

                const widgetHeight = this.computeSize()[1];
                const yStart = widgetHeight + TOP_PADDING;
                const availableHeight = this.size[1] - yStart - BOTTOM_PADDING;
                const availableWidth = this.size[0];

                if (availableHeight <= 10) {
                    return;
                }

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

            // Load preview from server
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
                            alert("No image selected");
                            return;
                        }
                        payload.image = imageWidget.value;
                    }

                    // Clear previous preview completely
                    clearPreview(this);

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
                            clearPreview(node);
                        };

                        img.src = imageUrl;
                    }

                } catch (error) {
                    console.error("Error loading preview:", error);
                    alert(`Error loading preview: ${error.message}`);
                }
            };

            // Update preview after node execution
            const onExecuted = nodeType.prototype.onExecuted;

            nodeType.prototype.onExecuted = function(message) {
                const result = onExecuted?.apply(this, arguments);
                this.loadPreview();
                return result;
            };
        }
    }
});
