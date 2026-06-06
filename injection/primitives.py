"""
Defect injection primitives for the visual-oracle-bench corpus.

Each function injects ONE defect category into a live Playwright page,
returning a structured DefectRecord describing what was changed.

Pre-registered defect categories (locked at OSF pre-registration 2026-06-19):
    layout      — bounding box shift >= 8 px on any axis
    color       — foreground or background hue shift >= 15 deg in HSL
    missing     — visible interactive element removed from DOM
    truncation  — text overflow without ellipsis, or vice versa
    zorder      — element rendered in front of element it should be behind
    contrast    — text/background contrast drops below WCAG AA (4.5:1)

W2 deliverable. Stub implementations — to be filled in W2.
"""

from dataclasses import dataclass
from typing import Optional, Literal

DefectCategory = Literal["layout", "color", "missing", "truncation", "zorder", "contrast"]


@dataclass(frozen=True)
class DefectRecord:
    """Record of a defect injection for ground-truth ledger."""
    app: str
    defect_id: str
    category: DefectCategory
    selector: str
    description: str
    diff_signature: str  # what a coder should look for to verify the defect


def shift_element(page, selector: str, dx: int = 12, dy: int = 0) -> DefectRecord:
    """
    Layout shift: translate element's bounding box by (dx, dy) pixels.

    Defect manifests as: SSIM drop > 0.05 in the shifted region.
    Inter-coder kappa target: >= 0.80.

    W2: implement via CSS `transform: translate(...)` injected on the element.
    """
    raise NotImplementedError("W2 stub")


def mutate_color(page, selector: str, prop: str = "color", delta_hue: int = 30) -> DefectRecord:
    """
    Color drift: rotate HSL hue of the given CSS property by `delta_hue` degrees.

    Defect manifests as: Delta-E2000 > 5 in affected pixels.
    Inter-coder kappa target: >= 0.75.

    W2: implement via Playwright `page.evaluate` reading computed style,
        rotating hue in HSL space, writing back via inline style.
    """
    raise NotImplementedError("W2 stub")


def remove_element(page, selector: str) -> DefectRecord:
    """
    Missing element: remove visible interactive element from DOM.

    Defect manifests as: >2% pixel delta in the element's prior region.
    Inter-coder kappa target: >= 0.90.

    W2: implement via Playwright `element.evaluate(el => el.remove())`.
    """
    raise NotImplementedError("W2 stub")


def shrink_container(page, selector: str, width_pct: float = 0.60) -> DefectRecord:
    """
    Truncation: shrink a container width to force overflow without ellipsis.

    Defect manifests as: edge-density spike at the container right boundary.
    Inter-coder kappa target: >= 0.75.

    W2: implement via Playwright setting `max-width` and `overflow:hidden`
        but NOT setting `text-overflow:ellipsis`.
    """
    raise NotImplementedError("W2 stub")


def swap_zindex(page, selector_a: str, selector_b: str) -> DefectRecord:
    """
    Z-order violation: invert the stacking of two overlapping elements.

    Defect manifests as: overlap region SSIM < 0.7 vs. baseline.
    Inter-coder kappa target: >= 0.70.

    W2: implement via Playwright reading both elements' computed z-index,
        swapping their inline `z-index` values.
    """
    raise NotImplementedError("W2 stub")


def reduce_contrast(page, text_selector: str, target_ratio: float = 3.0) -> DefectRecord:
    """
    Contrast violation: drop text/background contrast below WCAG AA (4.5:1).

    Defect manifests as: computed WCAG ratio < 4.5 (target: 3.0).
    Inter-coder kappa target: >= 0.75.

    W2: implement via Playwright reading text + background color, lightening
        text color toward background until target_ratio reached.
    """
    raise NotImplementedError("W2 stub")
