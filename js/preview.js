import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

/**
 * Extension to add live image preview to LoadImageByUrlOrPath node
 * Based on comfyui-load-image-url by Braeden90000
 */
app.registerExtension({
    name: "LoadImageByUrlOrPath.Preview",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "LoadImageByUrlOrPath") {

            // Store original onNodeCreated
            const onNodeCreated = nodeType.prototype.onNodeCreated;

            nodeType.prototype.onNodeCreated = function() {
                const result = onNodeCreated?.apply(this, arguments);

                // Create container for image preview
                const previewContainer = document.createElement("div");
                previewContainer.style.width = "100%";
                previewContainer.style.marginTop = "10px";
                previewContainer.style.display = "none";

                // Create image element
                const previewImg = document.createElement("img");
                previewImg.style.width = "100%";
                previewImg.style.height = "auto";
                previewImg.style.objectFit = "contain";
                previewImg.style.borderRadius = "4px";
                previewImg.style.border = "1px solid #444";

                previewContainer.appendChild(previewImg);

                // Add DOM widget for preview
                const widget = this.addDOMWidget(
                    "preview",
                    "preview",
                    previewContainer
                );
                widget.serialize = false; // Don't save to workflow

                // Store references
                this.previewWidget = widget;
                this.previewImg = previewImg;
                this.previewContainer = previewContainer;

                return result;
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

                    // Update preview image
                    if (this.previewImg && this.previewContainer) {
                        this.previewImg.src = imageUrl;
                        this.previewContainer.style.display = "block";

                        // Adjust node size when image loads
                        this.previewImg.onload = () => {
                            const minWidth = 320;
                            const currentWidth = this.size[0];

                            if (currentWidth < minWidth) {
                                this.setSize([minWidth, this.computeSize()[1]]);
                            } else {
                                this.setSize([currentWidth, this.computeSize()[1]]);
                            }

                            app.graph.setDirtyCanvas(true);
                        };

                        // Handle load errors
                        this.previewImg.onerror = () => {
                            console.error("Failed to load preview image");
                            this.previewContainer.style.display = "none";
                        };
                    }
                }

                return result;
            };

            // Handle source switching to show/hide relevant inputs
            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function(type, index, connected, link_info) {
                const result = onConnectionsChange?.apply(this, arguments);

                // Update widget visibility based on source selection
                const sourceWidget = this.widgets?.find(w => w.name === "source");
                const urlWidget = this.widgets?.find(w => w.name === "url");
                const imageWidget = this.widgets?.find(w => w.name === "image");

                if (sourceWidget && urlWidget && imageWidget) {
                    const source = sourceWidget.value;

                    if (source === "url") {
                        urlWidget.type = "text";
                        imageWidget.type = "converted-widget";
                    } else {
                        urlWidget.type = "converted-widget";
                        imageWidget.type = "combo";
                    }
                }

                return result;
            };
        }
    }
});
