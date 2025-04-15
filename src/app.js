import { Graph } from "graphology";
import gexf from "graphology-gexf";
import Sigma from "sigma";

document.addEventListener("DOMContentLoaded", () => {
  fetch("/data/medicamentos_adrs_only_network.gexf")
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

      // State variables for hover and search highlighting
      let hoveredNode = null;
      let searchQuery = "";
      let searchResults = new Set();

      // Create node info display panel
      const nodeInfoPanel = document.createElement("div");
      nodeInfoPanel.style.position = "absolute";
      nodeInfoPanel.style.bottom = "10px";
      nodeInfoPanel.style.left = "10px";
      nodeInfoPanel.style.padding = "10px";
      nodeInfoPanel.style.background = "rgba(255, 255, 255, 0.8)";
      nodeInfoPanel.style.borderRadius = "5px";
      nodeInfoPanel.style.boxShadow = "0 0 10px rgba(0,0,0,0.2)";
      nodeInfoPanel.style.zIndex = "1000";
      nodeInfoPanel.style.display = "none";
      document.getElementById("sigma-container").parentNode.appendChild(nodeInfoPanel);

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
          const nodeType = data.category || "other";

          // Get default color based on node type
          let defaultColor;
          switch (nodeType) {
            case "adr":
              defaultColor = "#E9573F"; // RED for medications
              break;
            case "medication":
              defaultColor = "#4B89DC"; // BLUE for ADRs
              break;
            default:
              defaultColor = "#999";
          }

          // Handle hover and search highlighting
          const isHighlighted =
            hoveredNode === node ||
            (hoveredNode !== null && graph.hasEdge(hoveredNode, node)) ||
            searchResults.has(node) ||
            (searchResults.size > 0 &&
              Array.from(searchResults).some(resultNode =>
                graph.hasEdge(resultNode, node)));

          // If something is hovered/searched and this node isn't highlighted, make it grey
          if ((hoveredNode !== null || searchResults.size > 0) && !isHighlighted) {
            res.color = "#DDDDDD"; // Grey for non-highlighted nodes
            res.zIndex = 0;
          } else {
            res.color = defaultColor;
            res.zIndex = 1;

            // Make highlighted nodes even more prominent
            if (isHighlighted) {
              res.zIndex = 2;
              res.highlighted = true;
              // Make hovered nodes or search results extra bold
              if (hoveredNode === node || searchResults.has(node)) {
                res.size = res.size * 1.5;
                res.zIndex = 3;
              }
            }
          }

          // Set size based on degree with more moderate scaling
          const nodeDegree = parseInt(data.degree) || 1;
          const minSize = 0.5;
          const maxSize = 7;

          const sizeScale = minSize + Math.sqrt(nodeDegree / maxDegree) * (maxSize - minSize);
          res.size = res.size || sizeScale;

          return res;
        },
        edgeReducer: (edge, data) => {
          // Get source and target nodes
          const sourceId = graph.source(edge);
          const targetId = graph.target(edge);

          // Get their degrees
          const sourceDegree = graph.getNodeAttribute(sourceId, "degree") || 1;
          const targetDegree = graph.getNodeAttribute(targetId, "degree") || 1;

          // Check if this edge should be highlighted
          const isHighlighted =
            (hoveredNode !== null &&
              (hoveredNode === sourceId || hoveredNode === targetId)) ||
            (searchResults.size > 0 &&
              (searchResults.has(sourceId) || searchResults.has(targetId)));

          // Use the current cutoff for filtering
          if (sourceDegree >= currentCutoff || targetDegree >= currentCutoff) {
            if ((hoveredNode !== null || searchResults.size > 0) && !isHighlighted) {
              // Grey out non-highlighted edges
              return {
                ...data,
                color: "#EEEEEE",
                size: 0.1,
                zIndex: 0
              };
            } else {
              // Normal or highlighted edges
              return {
                ...data,
                color: isHighlighted ? "#ff9900" : "#ccc", // Orange highlight, otherwise grey
                size: isHighlighted ? 1 : 0.2,
                zIndex: isHighlighted ? 1 : 0,
              };
            }
          } else {
            // Hide this edge
            return {
              ...data,
              hidden: true
            };
          }
        }
      });

      // Update node info panel on hover
      function updateNodeInfoPanel(nodeId) {
        if (!nodeId) {
          nodeInfoPanel.style.display = "none";
          return;
        }

        // Get node attributes
        const attributes = graph.getNodeAttributes(nodeId);
        const nodeName = attributes.label || nodeId;
        const nodeType = attributes.category ==  "medication" ? "Medication" : "ADR";

        // Get connected nodes by type
        const connectedNodesByType = {};

        graph.forEachNeighbor(nodeId, (neighbor, neighborAttributes) => {
          const neighborType = neighborAttributes.category || "Unknown";
          connectedNodesByType[neighborType] = (connectedNodesByType[neighborType] || 0) + 1;
        });

        // Build HTML for the info panel
        let infoHTML = `
          <h3>${nodeName}</h3>
          <p><strong>Type:</strong> ${nodeType}</p>
        `;

        // If there are connected nodes, show breakdown by type
        if (Object.keys(connectedNodesByType).length > 0) {
          infoHTML += `<p><strong>Connections:</strong></p><ul>`;
          for (const [type, count] of Object.entries(connectedNodesByType)) {
            infoHTML += `<li>${type}: ${count}</li>`;
          }
          infoHTML += `</ul>`;
        }

        // Update and show the panel
        nodeInfoPanel.innerHTML = infoHTML;
        nodeInfoPanel.style.display = "block";
      }

      // Set up hover events
      renderer.on("enterNode", ({ node }) => {
        hoveredNode = node;
        updateNodeInfoPanel(node);
        renderer.refresh();
      });

      renderer.on("leaveNode", () => {
        hoveredNode = null;
        updateNodeInfoPanel(null);
        renderer.refresh();
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

      // Add search box functionality
      const addSearchBox = () => {
        // Create search container
        const searchContainer = document.createElement("div");
        searchContainer.style.position = "absolute";
        searchContainer.style.top = "10px";
        searchContainer.style.left = "10px";
        searchContainer.style.zIndex = "1000";
        searchContainer.style.background = "white";
        searchContainer.style.padding = "10px";
        searchContainer.style.borderRadius = "5px";
        searchContainer.style.boxShadow = "0 0 10px rgba(0,0,0,0.2)";
        searchContainer.style.display = "flex";
        searchContainer.style.flexDirection = "column";
        searchContainer.style.gap = "5px";

        // Create search label
        const searchLabel = document.createElement("div");
        searchLabel.innerText = "Search nodes:";

        // Create search input
        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "Enter node name...";
        searchInput.style.width = "200px";
        searchInput.style.padding = "5px";

        // Create search results display
        const resultsDisplay = document.createElement("div");
        resultsDisplay.style.marginTop = "5px";
        resultsDisplay.style.fontSize = "12px";

        // Add search functionality
        searchInput.addEventListener("input", (e) => {
          const query = e.target.value.toLowerCase();
          searchQuery = query;
          searchResults.clear();

          if (query.length >= 2) { // Only search if query is at least 2 chars
            // Find matching nodes
            graph.forEachNode((nodeId, attributes) => {
              const nodeName = attributes.label || nodeId;
              if (nodeName.toLowerCase().includes(query)) {
                searchResults.add(nodeId);
              }
            });

            // Display result count and connection info
            if (searchResults.size === 1) {
              // If only one result, show detailed connection information
              const nodeId = Array.from(searchResults)[0];
              const connections = graph.degree(nodeId);
              resultsDisplay.innerHTML = `Found 1 node: <strong>${graph.getNodeAttribute(nodeId, 'label') || nodeId}</strong> with ${connections} connections`;

              // Update the info panel with this node's details
              updateNodeInfoPanel(nodeId);
            } else {
              resultsDisplay.innerText = `Found ${searchResults.size} matching nodes`;
              updateNodeInfoPanel(null);
            }
          } else {
            resultsDisplay.innerText = "";
            updateNodeInfoPanel(null);
          }

          renderer.refresh();
        });

        // Add clear button
        const clearButton = document.createElement("button");
        clearButton.innerText = "Clear";
        clearButton.style.marginTop = "5px";
        clearButton.style.padding = "5px";
        clearButton.style.cursor = "pointer";

        clearButton.addEventListener("click", () => {
          searchInput.value = "";
          searchQuery = "";
          searchResults.clear();
          resultsDisplay.innerText = "";
          updateNodeInfoPanel(null);
          renderer.refresh();
        });

        // Add elements to container
        searchContainer.appendChild(searchLabel);
        searchContainer.appendChild(searchInput);
        searchContainer.appendChild(resultsDisplay);
        searchContainer.appendChild(clearButton);
        container.parentNode.appendChild(searchContainer);
      };

      // Add the UI elements
      addCutoffSlider();
      addSearchBox();

      console.log("Sigma visualization rendered successfully");
    })
    .catch(error => {
      console.error("Error loading or rendering graph:", error);
    });
});
