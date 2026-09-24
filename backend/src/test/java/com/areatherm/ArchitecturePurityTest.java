package com.areatherm;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * Mechanically enforces ARCHITECTURE.md SS1's "thermal/ and optimization/
 * contain zero framework dependencies -- pure functions" -- catches drift
 * immediately instead of relying on review discipline.
 */
class ArchitecturePurityTest {

    private static final JavaClasses CLASSES = new ClassFileImporter().importPackages("com.areatherm");

    @Test
    void thermalAndOptimizationStayFrameworkFree() {
        ArchRule rule = noClasses()
            .that().resideInAnyPackage("com.areatherm.thermal..", "com.areatherm.optimization..")
            .should().dependOnClassesThat()
            .resideInAnyPackage("org.springframework..", "jakarta.persistence..", "jakarta.validation..");
        rule.check(CLASSES);
    }
}
