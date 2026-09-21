import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./Layout";
import { HomePage } from "./HomePage";
import { StyleguidePage } from "./StyleguidePage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "styleguide", element: <StyleguidePage /> },
    ],
  },
]);
