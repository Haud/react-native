/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

import type {
  EventTypeShape,
  NamedShape,
  EventTypeAnnotation,
} from '../../../CodegenSchema.js';
const {flattenProperties} = require('./componentsUtils');

function getPropertyType(
  /* $FlowFixMe[missing-local-annot] The type annotation(s) required by Flow's
   * LTI update could not be added via codemod */
  name,
  optional: boolean,
  /* $FlowFixMe[missing-local-annot] The type annotation(s) required by Flow's
   * LTI update could not be added via codemod */
  typeAnnotation,
): NamedShape<EventTypeAnnotation> {
  if (typeAnnotation.type === 'TSParenthesizedType') {
    return getPropertyType(name, optional, typeAnnotation.typeAnnotation);
  }
  const type =
    typeAnnotation.type === 'TSTypeReference'
      ? typeAnnotation.typeName.name
      : typeAnnotation.type;

  switch (type) {
    case 'TSBooleanKeyword':
      return {
        name,
        optional,
        typeAnnotation: {
          type: 'BooleanTypeAnnotation',
        },
      };
    case 'TSStringKeyword':
      return {
        name,
        optional,
        typeAnnotation: {
          type: 'StringTypeAnnotation',
        },
      };
    case 'Int32':
      return {
        name,
        optional,
        typeAnnotation: {
          type: 'Int32TypeAnnotation',
        },
      };
    case 'Double':
      return {
        name,
        optional,
        typeAnnotation: {
          type: 'DoubleTypeAnnotation',
        },
      };
    case 'Float':
      return {
        name,
        optional,
        typeAnnotation: {
          type: 'FloatTypeAnnotation',
        },
      };
    case 'Readonly':
      return getPropertyType(
        name,
        optional,
        typeAnnotation.typeParameters.params[0],
      );

    case 'TSTypeLiteral':
      return {
        name,
        optional,
        typeAnnotation: {
          type: 'ObjectTypeAnnotation',
          properties: typeAnnotation.members.map(buildPropertiesForEvent),
        },
      };

    case 'TSUnionType':
      // Check for <T | null | undefined>
      if (
        typeAnnotation.types.some(
          t => t.type === 'TSNullKeyword' || t.type === 'TSUndefinedKeyword',
        )
      ) {
        const optionalType = typeAnnotation.types.filter(
          t => t.type !== 'TSNullKeyword' && t.type !== 'TSUndefinedKeyword',
        )[0];

        // Check for <(T | T2) | null | undefined>
        return getPropertyType(name, true, optionalType);
      }

      return {
        name,
        optional,
        typeAnnotation: {
          type: 'StringEnumTypeAnnotation',
          options: typeAnnotation.types.map(option => option.literal.value),
        },
      };
    default:
      (type: empty);
      throw new Error(`Unable to determine event type for "${name}": ${type}`);
  }
}

function findEventArgumentsAndType(
  typeAnnotation: $FlowFixMe,
  types: TypeMap,
  bubblingType: void | 'direct' | 'bubble',
  paperName: ?$FlowFixMe,
) {
  if (typeAnnotation.type === 'TSInterfaceDeclaration') {
    return {
      argumentProps: flattenProperties([typeAnnotation], types),
      paperTopLevelNameDeprecated: paperName,
      bubblingType,
    };
  }

  if (typeAnnotation.type === 'TSTypeLiteral') {
    return {
      argumentProps: typeAnnotation.members,
      paperTopLevelNameDeprecated: paperName,
      bubblingType,
    };
  }

  if (!typeAnnotation.typeName) {
    throw new Error("typeAnnotation of event doesn't have a name");
  }
  const name = typeAnnotation.typeName.name;
  if (name === 'Readonly') {
    return findEventArgumentsAndType(
      typeAnnotation.typeParameters.params[0],
      types,
      bubblingType,
      paperName,
    );
  } else if (name === 'BubblingEventHandler' || name === 'DirectEventHandler') {
    const eventType = name === 'BubblingEventHandler' ? 'bubble' : 'direct';
    const paperTopLevelNameDeprecated =
      typeAnnotation.typeParameters.params.length > 1
        ? typeAnnotation.typeParameters.params[1].literal.value
        : null;

    switch (typeAnnotation.typeParameters.params[0].type) {
      case 'TSNullKeyword':
      case 'TSUndefinedKeyword':
        return {
          argumentProps: [],
          bubblingType: eventType,
          paperTopLevelNameDeprecated,
        };
      default:
        return findEventArgumentsAndType(
          typeAnnotation.typeParameters.params[0],
          types,
          eventType,
          paperTopLevelNameDeprecated,
        );
    }
  } else if (types[name]) {
    let elementType = types[name];
    if (elementType.type === 'TSTypeAliasDeclaration') {
      elementType = elementType.typeAnnotation;
    }
    return findEventArgumentsAndType(
      elementType,
      types,
      bubblingType,
      paperName,
    );
  } else {
    return {
      argumentProps: null,
      bubblingType: null,
      paperTopLevelNameDeprecated: null,
    };
  }
}

/* $FlowFixMe[missing-local-annot] The type annotation(s) required by Flow's
 * LTI update could not be added via codemod */
function buildPropertiesForEvent(property): NamedShape<EventTypeAnnotation> {
  const name = property.key.name;
  const optional = property.optional || false;
  let typeAnnotation = property.typeAnnotation.typeAnnotation;

  return getPropertyType(name, optional, typeAnnotation);
}

/* $FlowFixMe[missing-local-annot] The type annotation(s) required by Flow's
 * LTI update could not be added via codemod */
function getEventArgument(argumentProps, name: $FlowFixMe) {
  return {
    type: 'ObjectTypeAnnotation',
    properties: argumentProps.map(buildPropertiesForEvent),
  };
}

function findEvent(typeAnnotation: $FlowFixMe, optional: boolean) {
  switch (typeAnnotation.type) {
    // Check for T | null | undefined
    case 'TSUnionType':
      return findEvent(
        typeAnnotation.types.filter(
          t => t.type !== 'TSNullKeyword' && t.type !== 'TSUndefinedKeyword',
        )[0],
        optional ||
          typeAnnotation.types.some(
            t => t.type === 'TSNullKeyword' || t.type === 'TSUndefinedKeyword',
          ),
      );
    // Check for (T)
    case 'TSParenthesizedType':
      return findEvent(typeAnnotation.typeAnnotation, optional);
    case 'TSTypeReference':
      if (
        typeAnnotation.typeName.name !== 'BubblingEventHandler' &&
        typeAnnotation.typeName.name !== 'DirectEventHandler'
      ) {
        return null;
      } else {
        return {typeAnnotation, optional};
      }
    default:
      return null;
  }
}

function buildEventSchema(
  types: TypeMap,
  property: EventTypeAST,
): ?EventTypeShape {
  const name = property.key.name;
  const foundEvent = findEvent(
    property.typeAnnotation.typeAnnotation,
    property.optional || false,
  );
  if (!foundEvent) {
    return null;
  }
  const {typeAnnotation, optional} = foundEvent;
  const {argumentProps, bubblingType, paperTopLevelNameDeprecated} =
    findEventArgumentsAndType(typeAnnotation, types);

  if (bubblingType && argumentProps) {
    if (paperTopLevelNameDeprecated != null) {
      return {
        name,
        optional,
        bubblingType,
        paperTopLevelNameDeprecated,
        typeAnnotation: {
          type: 'EventTypeAnnotation',
          argument: getEventArgument(argumentProps, name),
        },
      };
    }

    return {
      name,
      optional,
      bubblingType,
      typeAnnotation: {
        type: 'EventTypeAnnotation',
        argument: getEventArgument(argumentProps, name),
      },
    };
  }

  if (argumentProps === null) {
    throw new Error(`Unable to determine event arguments for "${name}"`);
  }

  if (bubblingType === null) {
    throw new Error(`Unable to determine event arguments for "${name}"`);
  }
}

// $FlowFixMe[unclear-type] TODO(T108222691): Use flow-types for @babel/parser
type EventTypeAST = Object;

type TypeMap = {
  // $FlowFixMe[unclear-type] TODO(T108222691): Use flow-types for @babel/parser
  [string]: Object,
  ...
};

function getEvents(
  eventTypeAST: $ReadOnlyArray<EventTypeAST>,
  types: TypeMap,
): $ReadOnlyArray<EventTypeShape> {
  return eventTypeAST
    .filter(property => property.type === 'TSPropertySignature')
    .map(property => buildEventSchema(types, property))
    .filter(Boolean);
}

module.exports = {
  getEvents,
};
