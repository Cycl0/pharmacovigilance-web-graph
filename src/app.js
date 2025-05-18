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

      // State variables for selection and search highlighting
      let selectedNode = null;
      let hoveredNode = null; // (keep for search highlight compatibility)
      let searchQuery = "";
      let searchResults = new Set();

      // Calculate total mentions for all nodes
      let totalMentions = 0;
      graph.forEachNode((nodeId, attributes) => {
        const mentions = parseInt(attributes.mention_count) || 0;
        totalMentions += mentions;
      });

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

          // Handle selection and search highlighting
          const isHighlighted =
            selectedNode === node ||
            (selectedNode !== null && graph.hasEdge(selectedNode, node)) ||
            searchResults.has(node) ||
            (searchResults.size > 0 &&
              Array.from(searchResults).some(resultNode =>
                graph.hasEdge(resultNode, node)));

          // If something is selected/searched and this node isn't highlighted, make it grey
          if ((selectedNode !== null || searchResults.size > 0) && !isHighlighted) {
            res.color = "#DDDDDD"; // Grey for non-highlighted nodes
            res.zIndex = 0;
          } else {
            res.color = defaultColor;
            res.zIndex = 1;

            // Make highlighted nodes even more prominent
            if (isHighlighted) {
              res.zIndex = 2;
              res.highlighted = true;
              // Make selected nodes or search results extra bold
              if (selectedNode === node || searchResults.has(node)) {
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
            (selectedNode !== null &&
              (selectedNode === sourceId || selectedNode === targetId)) ||
            (searchResults.size > 0 &&
              (searchResults.has(sourceId) || searchResults.has(targetId)));

          // Use the current cutoff for filtering
          if (sourceDegree >= currentCutoff || targetDegree >= currentCutoff) {
            if ((selectedNode !== null || searchResults.size > 0) && !isHighlighted) {
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

      // Create dashboard panel (bottom right)
      const dashboardPanel = document.createElement("div");
      dashboardPanel.style.position = "absolute";
      dashboardPanel.style.bottom = "10px";
      dashboardPanel.style.right = "10px";
      dashboardPanel.style.padding = "15px";
      dashboardPanel.style.background = "rgba(255,255,255,0.95)";
      dashboardPanel.style.borderRadius = "8px";
      dashboardPanel.style.boxShadow = "0 0 12px rgba(0,0,0,0.18)";
      dashboardPanel.style.zIndex = "1001";
      dashboardPanel.style.minWidth = "320px";
      dashboardPanel.style.display = "none";
      container.parentNode.appendChild(dashboardPanel);

      // Build a sorted list of all nodes for the menu
      const allNodes = graph.nodes().map(nodeId => {
        const attrs = graph.getNodeAttributes(nodeId);
        return {
          id: nodeId,
          label: attrs.label || nodeId,
          category: attrs.category || ""
        };
      }).sort((a, b) => a.label.localeCompare(b.label));

      // Helper to deduplicate posts by category and content
      function deduplicatePosts(posts) {
        const seen = new Set();
        return posts.filter(post => {
          const key = `${post.category}||${post.content}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      // Update dashboard panel to handle new posts format and menu logic
      function updateDashboardPanel(nodeId) {
        dashboardPanel.innerHTML = "";
        if (!nodeId) {
          dashboardPanel.style.display = "none";
          return;
        }
        const attributes = graph.getNodeAttributes(nodeId);
        const nodeName = attributes.label || nodeId;
        const mentionCount = parseInt(attributes.mention_count) || 0;
        let posts = [];
        if (attributes.posts) {
          try {
            posts = attributes.posts.split('|||').map(p => {
              try {
                return JSON.parse(p.replace(/&quot;/g, '"'));
              } catch {
                return { content: p };
              }
            });
            posts = deduplicatePosts(posts);
          } catch (e) {
            posts = [{ content: attributes.posts }];
          }
        }
        const percentage = totalMentions > 0 ? ((mentionCount / totalMentions) * 100).toFixed(2) : "0.00";

        // Helper to normalize strings for robust matching
        function normalize(str) {
          return (str || '').toLowerCase().normalize('NFD').replace(/[0-\u036f]/g, '');
        }

        // Create dropdown menu inside dashboard
        const menuDiv = document.createElement("div");
        menuDiv.style.marginBottom = "10px";
        const menuLabel = document.createElement("label");
        menuLabel.innerText = "Filtrar por outro medicamento/ADR:";
        menuLabel.style.marginRight = "8px";
        const nodeSelect = document.createElement("select");
        nodeSelect.style.width = "180px";
        nodeSelect.style.padding = "4px";

        // Only show options that would actually result in posts
        const clickedAttrs = graph.getNodeAttributes(nodeId);
        const clickedLabel = clickedAttrs.label || nodeId;
        const clickedType = clickedAttrs.category; // "medication" or ADR name
        let validOptions;
        if (clickedType === "medication") {
          // Show only ADRs that are mentioned in the posts' category field
          const adrsMentioned = new Set(posts.map(post => post.category));
          validOptions = allNodes.filter(n =>
            n.id !== nodeId &&
            n.category !== "medication" &&
            adrsMentioned.has(n.label)
          );
        } else {
          // Show only medications that are mentioned in the posts' category field
          const medsMentioned = new Set(posts.map(post => post.category));
          validOptions = allNodes.filter(n =>
            n.id !== nodeId &&
            n.category === "medication" &&
            medsMentioned.has(n.label)
          );
        }
        nodeSelect.innerHTML = `<option value="">(Todos relacionados)</option>` +
          validOptions.map(n => `<option value="${n.id}">${n.label} (${n.category})</option>`).join("");
        menuDiv.appendChild(menuLabel);
        menuDiv.appendChild(nodeSelect);

        nodeSelect.addEventListener("change", () => {
          renderDashboardContent();
        });

        function renderDashboardContent() {
          const selectedId = nodeSelect.value;
          let filteredPosts;
          if (selectedId) {
            const selectedAttrs = graph.getNodeAttributes(selectedId);
            const selectedLabel = selectedAttrs.label || selectedId;
            if (clickedType === "medication") {
              filteredPosts = posts.filter(post => post.category === selectedLabel);
            } else {
              filteredPosts = posts.filter(post => post.category === selectedLabel);
            }
          } else {
            filteredPosts = posts;
          }
          let html = `
            <h4 style=\"margin-top:0\">${nodeName}</h4>
            <p><strong>Menções únicas:</strong> ${posts.length}<br>
            <strong>Posts exibidos:</strong> ${filteredPosts.length} de ${posts.length}</p>
            <p><strong>Posts relacionados:</strong></p>
            <ul style=\"max-height:120px;overflow:auto;padding-left:18px;\">
              ${filteredPosts.length > 0 ? filteredPosts.map(post => `<li style=\"margin-bottom:6px;\">${post.content}</li>`).join("") : '<li style=\"color:#888\">Nenhum post encontrado para esta combinação.</li>'}
            </ul>
          `;
          dashboardPanel.innerHTML = "";
          dashboardPanel.appendChild(menuDiv);
          const contentDiv = document.createElement("div");
          contentDiv.innerHTML = html;
          dashboardPanel.appendChild(contentDiv);
          dashboardPanel.style.display = "block";
        }

        // Initial render
        renderDashboardContent();
      }

      // Sync menu and click selection
      renderer.on("clickNode", ({ node }) => {
        selectedNode = node;
        updateDashboardPanel(node);
        renderer.refresh();
      });
      renderer.on("clickStage", () => {
        selectedNode = null;
        updateDashboardPanel(null);
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
        label.innerText = `Mostrar arestas para os ${topNodePercentage * 100}% principais nós`;
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

          label.innerText = `Mostrar arestas para os ${parseInt(e.target.value)}% principais nós`;
          console.log(`Atualizado: exibindo arestas apenas para nós com grau maior ou igual a ${currentCutoff} (topo ${newPercentage * 100}%)`);

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
        searchLabel.innerText = "Buscar por nó:";

        // Create search input
        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "Digite o nome do nó";
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
              resultsDisplay.innerHTML = `1 nó encontrado: <strong>${graph.getNodeAttribute(nodeId, 'label') || nodeId}</strong> com ${connections} conexões`;
            } else {
              resultsDisplay.innerText = `${searchResults.size} nós encontrados`;
            }
          } else {
            resultsDisplay.innerText = "";
          }

          renderer.refresh();
        });

        // Add clear button
        const clearButton = document.createElement("button");
        clearButton.innerText = "Limpar busca";
        clearButton.style.marginTop = "5px";
        clearButton.style.padding = "5px";
        clearButton.style.cursor = "pointer";

        clearButton.addEventListener("click", () => {
          searchInput.value = "";
          searchQuery = "";
          searchResults.clear();
          resultsDisplay.innerText = "";
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

      console.log("Visualização Sigma carregada com sucesso");
    })
    .catch(error => {
      console.error("Erro ao carregar ou exibir o grafo:", error);
    });
});
