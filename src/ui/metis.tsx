import {
  Alert,
  Button as MetisButton,
  Checkbox,
  DatePicker,
  Divider,
  Drawer,
  Input,
  InputNumber,
  Layout,
  List,
  Menu,
  Modal,
  Popconfirm,
  Select,
  Segmented,
  Splitter,
  Switch,
  Tabs,
  Table,
  Tag,
  Transition,
  Upload,
  message as MetisMessage,
  notification as MetisNotification,
} from "metis-ui";
import type { ButtonProps as MetisButtonProps } from "metis-ui";
import type { ReactNode } from "react";

type ButtonVariant = "primary" | "default" | "danger";

type ButtonProps = Omit<MetisButtonProps, "type" | "danger" | "htmlType" | "children"> & {
  readonly variant?: ButtonVariant;
  readonly htmlType?: MetisButtonProps["htmlType"];
  readonly children: ReactNode;
};

export function Button({ variant = "default", children, ...props }: ButtonProps) {
  return (
    <MetisButton
      autoInsertSpace={false}
      danger={variant === "danger"}
      htmlType={props.htmlType ?? "button"}
      type={variant === "primary" ? "primary" : "default"}
      {...props}
    >
      {children}
    </MetisButton>
  );
}

export { Alert, Checkbox, DatePicker, Divider, Drawer, Input, InputNumber, Layout, List, Menu, Modal, Popconfirm, Select, Segmented, Splitter, Switch, Tabs, Table, Tag, Transition, Upload };
export const Message = MetisMessage;
export const Notification = MetisNotification;
