// @ts-check

/**
 * Custom ESLint rule to enforce that database procedure functions return Result types.
 * This helps ensure all database operations have explicit error handling.
 *
 * @type {import('eslint').Rule.RuleModule}
 */
export const requireDbResultReturn = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce that database procedures return Result types for explicit error handling",
      category: "Best Practices",
      recommended: true,
    },
    messages: {
      missingResultReturn:
        "Database procedure '{{name}}' must return a Result or ResultAsync type. Use 'safeDbOperation' or add 'Safe' suffix to function name.",
      unsafeDbOperation:
        "Direct DbClient.unwrap usage detected. Use 'safeDbOperation' wrapper instead for type-safe error handling.",
    },
    schema: [],
  },

  create(context) {
    return {
      // Check function declarations and expressions in db procedures directory
      "FunctionDeclaration, FunctionExpression, ArrowFunctionExpression"(node) {
        const filename = context.filename ?? context.getFilename();

        // Only check files in db/src/procedures directory
        if (!filename.includes("/db/src/procedures/")) {
          return;
        }

        // Skip if function name ends with "Safe" (indicates safe wrapper)
        const functionName = getFunctionName(node);
        if (!functionName || functionName.endsWith("Safe")) {
          return;
        }

        // Check if function is exported (only check public API)
        const parent = node.parent;
        const isExported =
          parent?.type === "ExportNamedDeclaration" ||
          parent?.type === "ExportDefaultDeclaration";

        if (!isExported) {
          return;
        }

        // Check parameters for DbClient
        const hasDbClientParam = node.params?.some((param) => {
          if (param.type === "Identifier" && param.typeAnnotation) {
            const typeAnnotation = param.typeAnnotation.typeAnnotation;
            if (typeAnnotation?.type === "TSTypeReference") {
              const typeName = typeAnnotation.typeName;
              if (typeName?.type === "Identifier") {
                return typeName.name === "DbClient";
              }
            }
          }
          return false;
        });

        if (!hasDbClientParam) {
          return;
        }

        // Check return type
        const returnType = node.returnType?.typeAnnotation;
        if (!returnType) {
          context.report({
            node,
            messageId: "missingResultReturn",
            data: { name: functionName },
          });
          return;
        }

        // Check if return type includes Result or ResultAsync
        const hasResultReturn = checkForResultType(returnType);

        if (!hasResultReturn) {
          context.report({
            node,
            messageId: "missingResultReturn",
            data: { name: functionName },
          });
        }
      },

      // Warn about direct DbClient.unwrap usage
      "CallExpression[callee.object.name='DbClient'][callee.property.name='unwrap']"(
        node,
      ) {
        const filename = context.filename ?? context.getFilename();

        // Only check files in db/src/procedures directory
        if (!filename.includes("/db/src/procedures/")) {
          return;
        }

        // Allow in functions that end with "Safe" or are private
        const enclosingFunction = findEnclosingFunction(node);
        if (enclosingFunction) {
          const functionName = getFunctionName(enclosingFunction);
          if (functionName?.endsWith("Safe") || !functionName) {
            return;
          }
        }

        context.report({
          node,
          messageId: "unsafeDbOperation",
        });
      },
    };
  },
};

/**
 * @param {any} node
 * @returns {string | null}
 */
function getFunctionName(node) {
  if (node.type === "FunctionDeclaration" && node.id) {
    return node.id.name;
  }
  if (
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  ) {
    const parent = node.parent;
    if (
      parent?.type === "VariableDeclarator" &&
      parent.id?.type === "Identifier"
    ) {
      return parent.id.name;
    }
    if (parent?.type === "Property" && parent.key?.type === "Identifier") {
      return parent.key.name;
    }
  }
  return null;
}

/**
 * @param {any} typeNode
 * @returns {boolean}
 */
function checkForResultType(typeNode) {
  if (!typeNode) return false;

  if (typeNode.type === "TSTypeReference") {
    const typeName = typeNode.typeName;
    if (typeName?.type === "Identifier") {
      return (
        typeName.name === "Result" ||
        typeName.name === "ResultAsync" ||
        typeName.name === "DbResult"
      );
    }
  }

  // Check union types (e.g., Result<T, E> | OtherType)
  if (typeNode.type === "TSUnionType") {
    return typeNode.types?.some((type) => checkForResultType(type)) ?? false;
  }

  // Check for Promise<Result<T, E>>
  if (
    typeNode.type === "TSTypeReference" &&
    typeNode.typeName?.type === "Identifier" &&
    typeNode.typeName.name === "Promise"
  ) {
    const typeArgs = typeNode.typeParameters?.params;
    if (typeArgs && typeArgs.length > 0) {
      return checkForResultType(typeArgs[0]);
    }
  }

  return false;
}

/**
 * @param {any} node
 * @returns {any}
 */
function findEnclosingFunction(node) {
  let current = node;
  while (current) {
    if (
      current.type === "FunctionDeclaration" ||
      current.type === "FunctionExpression" ||
      current.type === "ArrowFunctionExpression"
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}
