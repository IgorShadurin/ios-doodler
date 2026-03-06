import type { Metadata } from "next";

import { PreviewImagesRoute } from "@/features/preview-images/PreviewImagesRoute";

export const metadata: Metadata = {
  title: "Preview Images",
  description:
    "Review generated App Store screenshots grouped by language before upload.",
  alternates: {
    canonical: "/preview-images",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function PreviewImagesPage() {
  return <PreviewImagesRoute />;
}
