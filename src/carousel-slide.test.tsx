import React, { type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { CarouselBlockNode } from "./carousel-slide.js";
import type { CarouselSlideRenderInput, TextBlock } from "./carousel-types.js";

vi.mock("konva", () => ({ default: {} }));
vi.mock("react-konva", () => {
  const component = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as React.ReactNode);
  return {
    Group: component("Group"),
    Image: component("Image"),
    Layer: component("Layer"),
    Line: component("Line"),
    Rect: component("Rect"),
    Shape: component("Shape"),
    Stage: component("Stage"),
    Text: component("Text"),
  };
});

function renderFunctionElement(element: ReactElement): ReactElement {
  expect(typeof element.type).toBe("function");
  return (element.type as (props: unknown) => ReactElement)(element.props);
}

describe("CarouselBlockNode text rendering", () => {
  const input: CarouselSlideRenderInput = {
    slide: { id: "slide-1", blocks: [] },
    slide_number: 1,
    canvas_width: 1080,
    canvas_height: 1350,
    pixel_ratio: 1,
  };

  it("does not clip plain text to the stored box height", () => {
    const block: TextBlock = {
      id: "text-1",
      type: "text",
      z: 1,
      x: 10,
      y: 20,
      w: 320,
      h: 48,
      rotation: 0,
      locked: false,
      content: {
        text: "Short text",
        font_size: 24,
        font_family: "Pretendard",
        font_weight: "700",
      },
    };

    const element = CarouselBlockNode({ block, input, onAssetReady: () => undefined }) as ReactElement;
    const group = renderFunctionElement(element) as ReactElement<{ children: React.ReactNode }>;
    const children = React.Children.toArray(group.props.children) as Array<ReactElement<Record<string, unknown>>>;
    const textNode = children[1];

    expect(textNode.props.width).toBe(320);
    expect(textNode.props.height).toBeUndefined();
  });
});
