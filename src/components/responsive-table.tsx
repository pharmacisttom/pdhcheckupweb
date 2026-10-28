"use client";
import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
  type TableHTMLAttributes,
} from "react";
type NodeProps = {
  children?: ReactNode;
  colSpan?: number;
  "data-label"?: string;
  role?: string;
};
function elements(nodes: ReactNode): ReactElement<NodeProps>[] {
  return Children.toArray(nodes).flatMap((node) =>
    isValidElement<NodeProps>(node)
      ? node.type === Fragment
        ? elements(node.props.children)
        : [node]
      : [],
  );
}
function label(nodes: ReactNode): string {
  return Children.toArray(nodes)
    .map((node) =>
      typeof node === "string" || typeof node === "number"
        ? String(node)
        : isValidElement<NodeProps>(node)
          ? label(node.props.children)
          : "",
    )
    .join(" ")
    .trim();
}
/** Keep the same controls and table semantics when rows become mobile cards. */
export function ResponsiveTable({
  children,
  className = "",
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  const sections = elements(children);
  const head = sections.find((section) => section.type === "thead");
  const headers = head
    ? elements(elements(head.props.children)[0]?.props.children).map((cell) =>
        label(cell.props.children),
      )
    : [];
  return (
    <table {...props} role="table" className={"responsive-table " + className}>
      {sections.map((section) => {
        if (section.type !== "thead" && section.type !== "tbody")
          return section;
        return cloneElement(section, {
          role: "rowgroup",
          children: elements(section.props.children).map((row) =>
            cloneElement(row, {
              role: "row",
              children: elements(row.props.children).map((cell, index) =>
                cloneElement(cell, {
                  role: section.type === "thead" ? "columnheader" : "cell",
                  children:
                    section.type === "tbody" ? (
                      <div className="mobile-cell-value">
                        {cell.props.children}
                      </div>
                    ) : (
                      cell.props.children
                    ),
                  "data-label":
                    section.type === "tbody" && !cell.props.colSpan
                      ? (cell.props["data-label"] ?? headers[index])
                      : undefined,
                }),
              ),
            }),
          ),
        });
      })}
    </table>
  );
}
