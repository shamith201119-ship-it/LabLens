import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cx } from '../lib/cx'
import { EASE } from '../lib/motion'

interface SectionHeadingProps {
  eyebrow: string
  title: ReactNode
  description?: ReactNode
  id?: string
  center?: boolean
  dark?: boolean
  className?: string
}

const wordVariants = {
  hidden: { y: '116%' },
  visible: {
    y: '0%',
    transition: { duration: 0.72, ease: EASE },
  },
}

/**
 * Word-by-word heading reveal. The trigger lives on the visible heading
 * element — not on the clipped inner spans, which have no intersection while
 * translated outside their mask.
 */
function AnimatedWords({ text, id }: { text: string; id?: string }) {
  const reduceMotion = useReducedMotion()
  const words = text.split(' ')

  return (
    <motion.h2
      id={id}
      className="section-heading__title section-heading__title--split"
      aria-label={text}
      initial={reduceMotion ? false : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, margin: '-8% 0px' }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.032 } },
      }}
    >
      {words.map((word, index) => (
        <span className="heading-word" key={`${word}-${index}`}>
          <motion.span className="heading-word__inner" variants={wordVariants}>
            {word}
          </motion.span>
        </span>
      ))}
    </motion.h2>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  id,
  center = false,
  dark = false,
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cx(
        'section-heading',
        center && 'section-heading--center',
        dark && 'section-heading--dark',
        className,
      )}
    >
      <p className="section-heading__kicker">{eyebrow}</p>
      {typeof title === 'string' ? (
        <AnimatedWords text={title} id={id} />
      ) : (
        <h2 id={id} className="section-heading__title">
          {title}
        </h2>
      )}
      {description ? <p>{description}</p> : null}
    </div>
  )
}
