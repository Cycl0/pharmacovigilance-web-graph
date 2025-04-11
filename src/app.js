import { Graph } from "graphology";
import gexf from "graphology-gexf";
import Sigma from "sigma";

document.addEventListener("DOMContentLoaded", () => {
fetch("/data/medicamentos_adrs_usuarios_network.gexf")
    .then((response) => response.text())
    .then((gexfString) => {
        // Parse the GEXF file
        const graph = gexf.parse(Graph, gexfString);

        // Find the maximum degree for scaling
        let maxDegree = 1;
        let minDegree = Infinity;

        graph.forEachNode((nodeId, attributes) => {
            const degree = parseInt(attributes.degree) || 1;
            if (degree > maxDegree) maxDegree = degree;
            if (degree < minDegree) minDegree = degree;

            // Ensure the degree is stored as a number
            attributes.degree = degree;

            // Process position string into separate x and y coordinates
            if (attributes.position && typeof attributes.position === "string") {
                const [x, y] = attributes.position.split(/\s+/).map(parseFloat);
                attributes.x = isNaN(x) ? Math.random() * 5 : x * 5;
                attributes.y = isNaN(y) ? Math.random() * 5 : y * 5;
            } else {
                attributes.x = Math.random() * 5;
                attributes.y = Math.random() * 5;
            }

            // Set rendering type
            attributes.type = "circle";
        });

        // Create an array of nodes sorted by degree
        const nodesByDegree = graph.nodes().map(nodeId => ({
            id: nodeId,
            degree: graph.getNodeAttribute(nodeId, "degree") || 1
        })).sort((a, b) => b.degree - a.degree);

        // Initial top node percentage
        const topNodePercentage = 0.1; // Top 10%

        // Create a variable to store the current cutoff
        let currentCutoff;

        // Function to calculate cutoff based on percentage
        const calculateCutoff = (percentage) => {
            const cutoffIndex = Math.floor(nodesByDegree.length * percentage);
            return nodesByDegree[Math.min(cutoffIndex, nodesByDegree.length - 1)].degree;
        };

        // Set initial cutoff
        currentCutoff = calculateCutoff(topNodePercentage);
        console.log(`Initial cutoff: showing edges only for nodes with degree >= ${currentCutoff} (top ${topNodePercentage * 100}%)`);

        // Create the Sigma instance
        const container = document.getElementById("sigma-container");
        const renderer = new Sigma(graph, container, {
            minCameraRatio: 0.05,
            maxCameraRatio: 20,
            renderLabels: true,
            renderEdgeLabels: false,
            labelSize: 12,
            labelColor: {
                color: "#000",
                attribute: null
            },
            nodeReducer: (node, data) => {
                const res = { ...data };

                // Set color based on node type
                const nodeType = data.type || "other";
                switch (nodeType) {
                    case "user":
                        res.color = "#4B89DC";
                        break;
                    case "medication":
                        res.color = "#2DCD9F";
                        break;
                    case "adr":
                        res.color = "#E9573F";
                        break;
                    default:
                        res.color = "#999";
                }

                // Set size based on degree with more moderate scaling
                const nodeDegree = parseInt(data.degree) || 1;
                const minSize = 0.5;
                const maxSize = 7;

                const sizeScale = minSize + Math.sqrt(nodeDegree / maxDegree) * (maxSize - minSize);
                res.size = sizeScale;

                return res;
            },
            edgeReducer: (edge, data) => {
                // Get source and target nodes
                const sourceId = graph.source(edge);
                const targetId = graph.target(edge);

                // Get their degrees
                const sourceDegree = graph.getNodeAttribute(sourceId, "degree") || 1;
                const targetDegree = graph.getNodeAttribute(targetId, "degree") || 1;

                // Use the current cutoff for filtering
                if (sourceDegree >= currentCutoff || targetDegree >= currentCutoff) {
                    return {
                        ...data,
                        color: "#ccc",
                        size: 0.2
                    };
                } else {
                    // Hide this edge
                    return {
                        ...data,
                        hidden: true
                    };
                }
            }
        });

        // Adjust the initial camera view to see the full graph
        renderer.getCamera().animatedReset();

        // Add UI control to adjust the degree cutoff
        const addCutoffSlider = () => {
            // Create slider container
            const sliderContainer = document.createElement("div");
            sliderContainer.style.position = "absolute";
            sliderContainer.style.top = "10px";
            sliderContainer.style.right = "10px";
            sliderContainer.style.zIndex = "1000";
            sliderContainer.style.background = "white";
            sliderContainer.style.padding = "10px";
            sliderContainer.style.borderRadius = "5px";
            sliderContainer.style.boxShadow = "0 0 10px rgba(0,0,0,0.2)";

            // Create label
            const label = document.createElement("div");
            label.innerText = `Edge visibility threshold: ${topNodePercentage * 100}%`;
            label.style.marginBottom = "5px";

            // Create slider
            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = "1";  // Minimum 1%
            slider.max = "100";
            slider.value = topNodePercentage * 100;
            slider.style.width = "200px";

            slider.addEventListener("input", (e) => {
                const newPercentage = parseInt(e.target.value) / 100;
                currentCutoff = calculateCutoff(newPercentage);

                label.innerText = `Edge visibility threshold: ${parseInt(e.target.value)}%`;
                console.log(`Updated: showing edges only for nodes with degree >= ${currentCutoff} (top ${newPercentage * 100}%)`);

                // Force a re-rendering with the new cutoff
                renderer.refresh();
            });

            sliderContainer.appendChild(label);
            sliderContainer.appendChild(slider);
            container.parentNode.appendChild(sliderContainer);
        };

        // Add the slider to the UI
        addCutoffSlider();

        console.log("Sigma visualization rendered successfully");
    })
    .catch(error => {
        console.error("Error loading or rendering graph:", error);
    });
});
