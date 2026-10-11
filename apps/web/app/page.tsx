import { manifests } from "../lib/registry";
import HomeTools from "../components/HomeTools";

export default function Home() {
  return <HomeTools manifests={manifests} />;
}
