// Mascote da ORG ON Camps. O arquivo atual é PROVISÓRIO:
// troque public/assets/mascote-provisorio.svg pela arte oficial.
const SRC = '/assets/mascote-provisorio.svg'

export default function Mascot({ className = 'h-16 w-16', bob = false }) {
  return (
    <img
      src={SRC}
      alt=""
      aria-hidden="true"
      className={`${className} select-none ${bob ? 'motion-safe:animate-bob' : ''}`}
      draggable="false"
    />
  )
}
