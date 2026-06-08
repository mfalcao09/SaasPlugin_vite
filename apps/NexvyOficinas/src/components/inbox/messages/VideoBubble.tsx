interface Props {
  url: string
  caption: string | null
}

export default function VideoBubble({ url, caption }: Props) {
  return (
    <>
      <video
        src={url}
        controls
        preload="metadata"
        className="rounded-lg mb-1 max-w-full max-h-80 bg-black"
      />
      {caption && <p className="whitespace-pre-wrap break-words mt-1">{caption}</p>}
    </>
  )
}
