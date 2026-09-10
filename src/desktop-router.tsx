import { QueryClient } from "@tanstack/react-query";
import { createRoute, createRouter, lazyRouteComponent } from "@tanstack/react-router";
import { Route as rootRoute } from "./routes/__root";

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: lazyRouteComponent(() => import("./routes/index"), "Index"),
});

const convertRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/convertir",
  component: lazyRouteComponent(() => import("./routes/convertir"), "ConvertRoute"),
});

const flipbookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/flipbook",
  component: lazyRouteComponent(() => import("./routes/flipbook"), "FlipbookRoute"),
});

const aiRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ia",
  component: lazyRouteComponent(() => import("./routes/ia"), "AiRoute"),
});

const ocrRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ocr",
  component: lazyRouteComponent(() => import("./routes/ocr"), "OcrRoute"),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  convertRoute,
  flipbookRoute,
  aiRoute,
  ocrRoute,
]);

export function getDesktopRouter() {
  return createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });
}
