import { Suspense } from "react";
import { manifests } from "../lib/registry";
import HomeTools from "../components/HomeTools";

export default function Home() {
  return (
    <Suspense>
      <HomeTools manifests={manifests} />
    </Suspense>
  );
}
