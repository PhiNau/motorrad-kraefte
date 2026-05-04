const STORAGE_KEY = "er-diagram-editor-state";
const SVG_NS = "http://www.w3.org/2000/svg";

const state = {
  entities: [],
  relationships: [],
};

const diagram = document.querySelector("#diagram");
const layer = document.querySelector("#diagram-layer");
const entityForm = document.querySelector("#entity-form");
const relationshipForm = document.querySelector("#relationship-form");
const entityName = document.querySelector("#entity-name");
const entityAttributes = document.querySelector("#entity-attributes");
const relationshipName = document.querySelector("#relationship-name");
const relationshipFrom = document.querySelector("#relationship-from");
const relationshipTo = document.querySelector("#relationship-to");
const relationshipFromCardinality = document.querySelector("#relationship-from-cardinality");
const relationshipToCardinality = document.querySelector("#relationship-to-cardinality");
const relationshipAttributes = document.querySelector("#relationship-attributes");
const itemsList = document.querySelector("#items-list");
const sampleButton = document.querySelector("#sample-button");
const clearButton = document.querySelector("#clear-button");
const exportButton = document.querySelector("#export-button");
const statusEl = document.querySelector("#status");

let drag = null;
let saveTimer = null;
let cardinalityLabels = [];

function uid(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseAttributes(value) {
  return value
    .split(",")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const key = raw.endsWith("*");
      return {
        id: uid("attribute"),
        name: key ? raw.slice(0, -1).trim() : raw,
        key,
      };
    });
}

function textWidth(text, min, perChar, max) {
  return Math.min(max, Math.max(min, text.length * perChar + 36));
}

function createSvg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
  return el;
}

function createText(text, x, y, className = "diagram-text") {
  const el = createSvg("text", { x, y, class: className });
  el.textContent = text;
  return el;
}

function getEntity(id) {
  return state.entities.find((entity) => entity.id === id);
}

function setStatus(text) {
  statusEl.textContent = text;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  setStatus("Speichert...");
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setStatus("Automatisch gespeichert");
  }, 180);
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    loadSample(false);
    return;
  }

  try {
    const parsed = JSON.parse(saved);
    state.entities = Array.isArray(parsed.entities) ? parsed.entities : [];
    state.relationships = Array.isArray(parsed.relationships) ? parsed.relationships : [];
    normalizeState();
  } catch {
    loadSample(false);
  }
}

function normalizeState() {
  state.entities.forEach((entity) => {
    entity.attributes = Array.isArray(entity.attributes) ? entity.attributes : [];
    entity.attributes.forEach((attribute) => {
      attribute.id = attribute.id || uid("attribute");
    });
  });

  state.relationships.forEach((relationship) => {
    relationship.attributes = Array.isArray(relationship.attributes) ? relationship.attributes : [];
    relationship.attributes.forEach((attribute) => {
      attribute.id = attribute.id || uid("attribute");
    });
  });
}

function addEntity(name, attributes, position) {
  const index = state.entities.length;
  state.entities.push({
    id: uid("entity"),
    name,
    attributes,
    x: position?.x ?? 210 + (index % 3) * 360,
    y: position?.y ?? 180 + Math.floor(index / 3) * 260,
  });
}

function addRelationship(name, fromId, toId, fromCardinality, toCardinality, attributes, position) {
  const from = getEntity(fromId);
  const to = getEntity(toId);
  state.relationships.push({
    id: uid("relationship"),
    name,
    fromId,
    toId,
    fromCardinality,
    toCardinality,
    attributes,
    x: position?.x ?? (from.x + to.x) / 2,
    y: position?.y ?? (from.y + to.y) / 2,
  });
}

function render() {
  layer.replaceChildren();
  cardinalityLabels = [];
  renderRelationships();
  renderEntities();
  renderCardinalityLabels();
  renderControls();
}

function renderEntities() {
  state.entities.forEach((entity) => {
    const width = textWidth(entity.name, 112, 13, 220);
    renderAttributes(entity, entity.attributes, width);

    const group = createSvg("g", {
      class: "entity-node",
      "data-kind": "entity",
      "data-id": entity.id,
      transform: `translate(${entity.x} ${entity.y})`,
    });

    group.append(
      createSvg("rect", {
        x: -width / 2,
        y: -28,
        width,
        height: 56,
        class: "entity-box",
      }),
      createText(entity.name, 0, 0),
    );

    layer.appendChild(group);
  });
}

function renderAttributes(owner, attributes, ownerWidth) {
  const count = attributes.length;
  if (!count) return;

  const radiusX = Math.max(150, ownerWidth * 1.15);
  const radiusY = 126 + Math.min(80, count * 5);
  const start = count === 1 ? -Math.PI / 2 : -Math.PI * 0.92;
  const end = Math.PI * 0.92;

  attributes.forEach((attribute, index) => {
    const position = getAttributePosition(attribute, owner, index, count, radiusX, radiusY, start, end);
    const { x, y } = position;
    const width = textWidth(attribute.name, 104, 11, 230);

    layer.appendChild(createSvg("line", {
      x1: owner.x,
      y1: owner.y,
      x2: x,
      y2: y,
      class: "diagram-line",
    }));

    const group = createSvg("g", {
      class: "attribute-node",
      "data-kind": "attribute",
      "data-id": attribute.id,
      "data-x": x,
      "data-y": y,
    });
    group.append(
      createSvg("ellipse", {
        cx: x,
        cy: y,
        rx: width / 2,
        ry: 33,
        class: "attribute-oval",
      }),
      createText(attribute.name, x, y, `diagram-text attribute-text${attribute.key ? " key-text" : ""}`),
    );
    layer.appendChild(group);
  });
}

function getAttributePosition(attribute, owner, index, count, radiusX, radiusY, start, end) {
  if (Number.isFinite(attribute.x) && Number.isFinite(attribute.y)) {
    return { x: attribute.x, y: attribute.y };
  }

  const angle = count === 1 ? start : start + ((end - start) * index) / (count - 1);
  return {
    x: owner.x + Math.cos(angle) * radiusX,
    y: owner.y + Math.sin(angle) * radiusY,
  };
}

function renderRelationships() {
  state.relationships.forEach((relationship) => {
    const from = getEntity(relationship.fromId);
    const to = getEntity(relationship.toId);
    if (!from || !to) return;

    const diamondWidth = textWidth(relationship.name, 150, 13, 250);
    const diamondHeight = 72;
    const points = [
      [relationship.x, relationship.y - diamondHeight / 2],
      [relationship.x + diamondWidth / 2, relationship.y],
      [relationship.x, relationship.y + diamondHeight / 2],
      [relationship.x - diamondWidth / 2, relationship.y],
    ].map((point) => point.join(",")).join(" ");

    layer.append(
      createSvg("line", {
        x1: from.x,
        y1: from.y,
        x2: relationship.x,
        y2: relationship.y,
        class: "diagram-line",
      }),
      createSvg("line", {
        x1: relationship.x,
        y1: relationship.y,
        x2: to.x,
        y2: to.y,
        class: "diagram-line",
      }),
    );

    cardinalityLabels.push(
      {
        text: relationship.fromCardinality,
        x: lerp(from.x, relationship.x, 0.22),
        y: lerp(from.y, relationship.y, 0.22) - 20,
      },
      {
        text: relationship.toCardinality,
        x: lerp(to.x, relationship.x, 0.22),
        y: lerp(to.y, relationship.y, 0.22) - 20,
      },
    );

    renderRelationshipAttributes(relationship, diamondHeight);

    const group = createSvg("g", {
      class: "relationship-node",
      "data-kind": "relationship",
      "data-id": relationship.id,
    });
    group.append(
      createSvg("polygon", {
        points,
        class: "relationship-diamond",
      }),
      createText(relationship.name, relationship.x, relationship.y),
    );
    layer.appendChild(group);
  });
}

function renderRelationshipAttributes(relationship, diamondHeight) {
  relationship.attributes.forEach((attribute, index) => {
    const width = textWidth(attribute.name, 98, 11, 210);
    const defaultX = relationship.x + (index - (relationship.attributes.length - 1) / 2) * 138;
    const defaultY = relationship.y + diamondHeight + 48;
    const x = Number.isFinite(attribute.x) ? attribute.x : defaultX;
    const y = Number.isFinite(attribute.y) ? attribute.y : defaultY;

    layer.appendChild(createSvg("line", {
      x1: relationship.x,
      y1: relationship.y + diamondHeight / 2,
      x2: x,
      y2: y - 32,
      class: "diagram-line",
    }));
    const group = createSvg("g", {
      class: "attribute-node",
      "data-kind": "attribute",
      "data-id": attribute.id,
      "data-x": x,
      "data-y": y,
    });
    group.append(
      createSvg("ellipse", {
        cx: x,
        cy: y,
        rx: width / 2,
        ry: 31,
        class: "attribute-oval",
      }),
      createText(attribute.name, x, y, "diagram-text attribute-text"),
    );
    layer.appendChild(group);
  });
}

function renderCardinalityLabels() {
  cardinalityLabels.forEach((label) => {
    layer.appendChild(createText(label.text, label.x, label.y, "cardinality-text"));
  });
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function renderControls() {
  renderEntityOptions();
  renderItems();
  relationshipForm.querySelector("button").disabled = state.entities.length < 2;
}

function renderEntityOptions() {
  const options = state.entities.map((entity) => {
    const option = document.createElement("option");
    option.value = entity.id;
    option.textContent = entity.name;
    return option;
  });

  relationshipFrom.replaceChildren(...options.map((option) => option.cloneNode(true)));
  relationshipTo.replaceChildren(...options);

  if (state.entities[0]) relationshipFrom.value = state.entities[0].id;
  if (state.entities[1]) relationshipTo.value = state.entities[1].id;
}

function renderItems() {
  if (!state.entities.length && !state.relationships.length) {
    itemsList.innerHTML = '<p class="empty">Noch keine Elemente vorhanden.</p>';
    return;
  }

  const fragments = [
    ...state.entities.map((entity) => itemRow("Entität", entity.name, entity.id)),
    ...state.relationships.map((relationship) => {
      const from = getEntity(relationship.fromId)?.name ?? "?";
      const to = getEntity(relationship.toId)?.name ?? "?";
      return itemRow("Beziehung", `${from} ${relationship.fromCardinality} - ${relationship.toCardinality} ${to}: ${relationship.name}`, relationship.id);
    }),
  ];

  itemsList.replaceChildren(...fragments);
}

function itemRow(type, label, id) {
  const row = document.createElement("div");
  row.className = "item";
  const text = document.createElement("div");
  const strong = document.createElement("strong");
  const span = document.createElement("span");
  const button = document.createElement("button");
  strong.textContent = label;
  span.textContent = type;
  button.type = "button";
  button.textContent = "Löschen";
  button.addEventListener("click", () => removeItem(id));
  text.append(strong, span);
  row.append(text, button);
  return row;
}

function removeItem(id) {
  const entityIndex = state.entities.findIndex((entity) => entity.id === id);
  if (entityIndex >= 0) {
    state.entities.splice(entityIndex, 1);
    state.relationships = state.relationships.filter((relationship) => relationship.fromId !== id && relationship.toId !== id);
  } else {
    state.relationships = state.relationships.filter((relationship) => relationship.id !== id);
  }
  scheduleSave();
  render();
}

function findAttribute(id) {
  for (const entity of state.entities) {
    const attribute = entity.attributes.find((candidate) => candidate.id === id);
    if (attribute) {
      return { attribute, owner: entity, ownerKind: "entity" };
    }
  }

  for (const relationship of state.relationships) {
    const attribute = relationship.attributes.find((candidate) => candidate.id === id);
    if (attribute) {
      return { attribute, owner: relationship, ownerKind: "relationship" };
    }
  }

  return null;
}

function shiftPositionedAttributes(attributes, deltaX, deltaY) {
  attributes.forEach((attribute) => {
    if (Number.isFinite(attribute.x) && Number.isFinite(attribute.y)) {
      attribute.x += deltaX;
      attribute.y += deltaY;
    }
  });
}

function svgPoint(event) {
  const point = diagram.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(diagram.getScreenCTM().inverse());
}

function beginDrag(event) {
  const node = event.target.closest("[data-kind]");
  if (!node) return;

  const kind = node.dataset.kind;
  const id = node.dataset.id;
  let item = null;

  if (kind === "entity") {
    item = getEntity(id);
  } else if (kind === "relationship") {
    item = state.relationships.find((relationship) => relationship.id === id);
  } else if (kind === "attribute") {
    item = findAttribute(id)?.attribute;
    if (!item) return;

    item.x = Number.isFinite(item?.x) ? item.x : Number(node.dataset.x);
    item.y = Number.isFinite(item?.y) ? item.y : Number(node.dataset.y);
  }

  if (!item) return;

  const point = svgPoint(event);
  drag = {
    kind,
    item,
    offsetX: point.x - item.x,
    offsetY: point.y - item.y,
    lastX: item.x,
    lastY: item.y,
  };
  node.classList.add("dragging");
  diagram.setPointerCapture(event.pointerId);
}

function moveDrag(event) {
  if (!drag) return;
  const point = svgPoint(event);
  const nextX = Math.max(70, Math.min(1330, point.x - drag.offsetX));
  const nextY = Math.max(60, Math.min(790, point.y - drag.offsetY));
  const deltaX = nextX - drag.lastX;
  const deltaY = nextY - drag.lastY;

  drag.item.x = nextX;
  drag.item.y = nextY;

  if (drag.kind === "entity") {
    shiftPositionedAttributes(drag.item.attributes, deltaX, deltaY);
  } else if (drag.kind === "relationship") {
    shiftPositionedAttributes(drag.item.attributes, deltaX, deltaY);
  }

  drag.lastX = nextX;
  drag.lastY = nextY;
  render();
}

function endDrag(event) {
  if (!drag) return;
  drag = null;
  diagram.releasePointerCapture(event.pointerId);
  scheduleSave();
}

function loadSample(shouldSave = true) {
  state.entities = [];
  state.relationships = [];

  addEntity("Verlag", parseAttributes("VID*, Name, Sitz, Ansprechpartner"), { x: 220, y: 285 });
  addEntity("Buch", parseAttributes("ISBN*, Kategorie, Titel, Autor, Preis"), { x: 700, y: 285 });
  addEntity("Kunde", parseAttributes("Vorname, Nachname, Adresse, Email, Passwort, Benutzername*"), { x: 1120, y: 285 });
  addEntity("Darstellung", parseAttributes("DID*, d. Bewertung, lieferbar"), { x: 700, y: 570 });

  addRelationship("veröffentlicht", state.entities[0].id, state.entities[1].id, "1", "n", [], { x: 455, y: 285 });
  addRelationship("bestellt", state.entities[1].id, state.entities[2].id, "n", "m", parseAttributes("Anzahl"), { x: 905, y: 285 });
  addRelationship("besitzt", state.entities[1].id, state.entities[3].id, "1", "1", [], { x: 700, y: 420 });

  if (shouldSave) scheduleSave();
  render();
}

function clearAll() {
  state.entities = [];
  state.relationships = [];
  scheduleSave();
  render();
}

function exportSvg() {
  const clone = diagram.cloneNode(true);
  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("width", "1400");
  clone.setAttribute("height", "850");
  const style = document.createElementNS(SVG_NS, "style");
  style.textContent = `
    .diagram-line{stroke:#2f3a3f;stroke-width:2;fill:none}
    .entity-box,.relationship-diamond,.attribute-oval{fill:#eaf3f5;stroke:#2f3a3f;stroke-width:2}
    .diagram-text{fill:#243035;font:24px Arial,sans-serif;dominant-baseline:middle;text-anchor:middle}
    .attribute-text{font-size:20px}
    .key-text{font-weight:800;text-decoration:underline}
    .cardinality-text{fill:#243035;font:bold 22px Arial,sans-serif;text-anchor:middle;dominant-baseline:middle}
  `;
  clone.prepend(style);

  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "er-diagramm.svg";
  link.click();
  URL.revokeObjectURL(link.href);
}

entityForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addEntity(entityName.value.trim(), parseAttributes(entityAttributes.value));
  entityForm.reset();
  entityName.focus();
  scheduleSave();
  render();
});

relationshipForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (relationshipFrom.value === relationshipTo.value) return;

  addRelationship(
    relationshipName.value.trim(),
    relationshipFrom.value,
    relationshipTo.value,
    relationshipFromCardinality.value.trim(),
    relationshipToCardinality.value.trim(),
    parseAttributes(relationshipAttributes.value),
  );
  relationshipName.value = "";
  relationshipAttributes.value = "";
  scheduleSave();
  render();
});

diagram.addEventListener("pointerdown", beginDrag);
diagram.addEventListener("pointermove", moveDrag);
diagram.addEventListener("pointerup", endDrag);
diagram.addEventListener("pointercancel", endDrag);
sampleButton.addEventListener("click", () => loadSample(true));
clearButton.addEventListener("click", clearAll);
exportButton.addEventListener("click", exportSvg);

loadState();
render();
