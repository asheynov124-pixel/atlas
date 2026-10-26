import { StaticText, type EditableProps } from '../templates/kit';

// Phase 0 placeholder: the in-place editor arrives in Phase 2.
export default function EditableField({ html, as = 'div', single, className, style, id }: EditableProps) {
  return <StaticText as={as} html={html} single={single} className={className} style={style} id={id} />;
}
