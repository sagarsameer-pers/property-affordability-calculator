// Property Affordability Calculator for NSW and WA - New Business Logic
class AffordabilityCalculator {
    constructor() {
        this.form = document.getElementById('affordabilityForm');
        this.results = document.getElementById('results');
        this.placeholder = document.getElementById('placeholderMessage');
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.calculateAffordability();
        });

        // Add real-time comma formatting to currency fields
        document.getElementById('borrowingCapacity').addEventListener('input', (e) => {
            this.formatCurrencyFieldSafe(e.target);
        });

        document.getElementById('moneySavedUp').addEventListener('input', (e) => {
            this.formatCurrencyFieldSafe(e.target);
        });
        

    }

    formatCurrencyFieldSafe(input) {
        // Get current value
        const currentValue = input.value;
        
        // Remove all non-digit characters
        const digitsOnly = currentValue.replace(/[^\d]/g, '');
        
        // If we have digits, format them
        if (digitsOnly.length > 0) {
            // Format with commas, but only if the result would be different
            const formatted = parseInt(digitsOnly, 10).toLocaleString();
            
            // Only update if different to avoid cursor jumping
            if (formatted !== currentValue) {
                // Set the formatted value and put cursor at the end
                input.value = formatted;
                input.setSelectionRange(input.value.length, input.value.length);
            }
        }
        // If no digits, leave the field exactly as is
    }

    calculateAffordability() {
        const formData = new FormData(this.form);
        const borrowingCapacity = parseInt(formData.get('borrowingCapacity').replace(/,/g, '').trim()) || 0;
        const moneySavedUp = parseInt(formData.get('moneySavedUp').replace(/,/g, '').trim()) || 0;
        const depositPercent = parseFloat(formData.get('depositPercent')) || 10;
        const lmiCoveragePercent = parseFloat(formData.get('lmiCoveragePercent')) || 2;
        const repaymentPeriod = parseFloat(formData.get('repaymentPeriod')) || 30;
        const interestRate = parseFloat(formData.get('interestRate')) || 6.35;
        const propertyAppreciation = parseFloat(formData.get('propertyAppreciation')) || 2.0;
        const repaymentType = formData.get('repaymentType') || 'principal-interest';
        const state = formData.get('state');
        const buyerType = formData.get('buyerType');

        if (!state || !buyerType || borrowingCapacity <= 0 || moneySavedUp <= 0) {
            alert('Please fill in all required fields with valid values');
            return;
        }

        if (depositPercent < 0 || depositPercent > 100) {
            alert('Deposit percentage must be between 0% and 100%');
            return;
        }

        if (lmiCoveragePercent < 0 || lmiCoveragePercent > 10) {
            alert('LMI coverage percentage must be between 0% and 10%');
            return;
        }

        if (repaymentPeriod < 1 || repaymentPeriod > 50) {
            alert('Repayment period must be between 1 and 50 years');
            return;
        }

        if (interestRate < 0 || interestRate > 20) {
            alert('Interest rate must be between 0% and 20%');
            return;
        }

        if (propertyAppreciation < 0 || propertyAppreciation > 15) {
            alert('Property appreciation must be between 0% and 15%');
            return;
        }

        // Calculate maximum property price using the new business logic
        const result = this.findMaxPropertyPrice(
            borrowingCapacity, 
            moneySavedUp, 
            depositPercent, 
            lmiCoveragePercent, 
            state, 
            buyerType,
            repaymentPeriod,
            interestRate,
            repaymentType
        );

        if (result.maxPropertyPrice <= 0) {
            alert('Based on your inputs, you may not be able to afford a property. Consider adjusting your parameters.');
            return;
        }

        this.displayResults({
            ...result,
            borrowingCapacity,
            moneySavedUp,
            depositPercent,
            lmiCoveragePercent,
            repaymentPeriod,
            interestRate,
            propertyAppreciation,
            repaymentType,
            state,
            buyerType
        });
    }

    findMaxPropertyPrice(borrowingCapacity, moneySavedUp, depositPercent, lmiCoveragePercent, state, buyerType, repaymentPeriod, interestRate, repaymentType) {
        // Binary search to find maximum affordable property price
        let low = 100000;
        let high = 10000000;
        let maxAffordable = 0;
        let bestResult = null;
        
        for (let iteration = 0; iteration < 50; iteration++) {
            const propertyPrice = Math.floor((low + high) / 2);
            
            // Calculate stamp duty for this property price
            const stampDutyResult = this.calculateStampDuty(propertyPrice, state, buyerType);
            const stampDuty = stampDutyResult.stampDuty;
            const additionalCharges = stampDutyResult.additionalCharges;
            
            // Calculate required amounts based on constraints
            const requiredDeposit = Math.round((propertyPrice * depositPercent) / 100);
            const lmiCoverage = Math.round((propertyPrice * lmiCoveragePercent) / 100); // LMI covers y% of property price
            
            // Calculate LMI cost based on realistic LVR-based premium rates
            const loanAmount = propertyPrice - requiredDeposit + lmiCoverage; // Loan includes LMI coverage
            const lvr = (loanAmount / propertyPrice) * 100;
            const lmiCostCalculated = this.calculateLMIPremium(loanAmount, lvr, buyerType);
            
            // Only include LMI if the cost is less than or equal to the contribution
            const shouldUseLMI = lmiCostCalculated <= lmiCoverage;
            const actualLmiCoverage = shouldUseLMI ? lmiCoverage : 0;
            const actualLmiCost = shouldUseLMI ? lmiCostCalculated : 0;
            
            // Total cost on left side: Property Price + Stamp Duty + Additional Charges + LMI Cost
            const totalCost = propertyPrice + stampDuty + additionalCharges + actualLmiCost;
            
            // Total resources on right side: Money Saved + LMI Coverage + Borrowing Capacity
            const totalResources = moneySavedUp + actualLmiCoverage + borrowingCapacity;
            
            // Check constraints:
            // 1. Money Saved + LMI Coverage >= Required Deposit
            // 2. Total Resources >= Total Cost
            // 3. Money Saved >= LMI Cost (LMI cost must come from savings)
            // 4. Total Borrowed <= 90% of Property Price (Maximum LVR constraint)
            const constraint1 = (moneySavedUp + actualLmiCoverage) >= requiredDeposit;
            const constraint2 = totalResources >= totalCost;
            const constraint3 = moneySavedUp >= (requiredDeposit - actualLmiCoverage + actualLmiCost); // Must have enough savings for deposit portion + LMI cost
            
            // Calculate total borrowed amount for LVR check
            const savingsForDepositTemp = Math.min(moneySavedUp, requiredDeposit - actualLmiCoverage);
            const savingsForLMITemp = Math.min(moneySavedUp - savingsForDepositTemp, actualLmiCost);
            const savingsForStampDutyTemp = Math.min(moneySavedUp - savingsForDepositTemp - savingsForLMITemp, stampDuty);
            const savingsForChargesTemp = Math.min(moneySavedUp - savingsForDepositTemp - savingsForLMITemp - savingsForStampDutyTemp, additionalCharges);
            
            // Use any remaining savings to reduce property borrowing
            const savingsUsedForSpecificItemsTemp = savingsForDepositTemp + savingsForLMITemp + savingsForStampDutyTemp + savingsForChargesTemp;
            const remainingSavingsForPropertyTemp = Math.max(0, moneySavedUp - savingsUsedForSpecificItemsTemp);
            
            const borrowedForPropertyTemp = Math.max(0, propertyPrice - savingsForDepositTemp - remainingSavingsForPropertyTemp - actualLmiCoverage);
            const borrowedForStampDutyTemp = Math.max(0, stampDuty - savingsForStampDutyTemp);
            const borrowedForChargesTemp = Math.max(0, additionalCharges - savingsForChargesTemp);
            const totalBorrowedTemp = borrowedForPropertyTemp + borrowedForStampDutyTemp + borrowedForChargesTemp;
            
            // Banking regulation: Total loan cannot exceed 90% of property value
            const maxAllowedLoan = propertyPrice * 0.90; // 90% maximum LVR
            const constraint4 = totalBorrowedTemp <= maxAllowedLoan;
            
            if (constraint1 && constraint2 && constraint3 && constraint4) {
                maxAffordable = propertyPrice;
                
                // Calculate deposit breakdown - maximize use of savings first
                const depositFromSavings = Math.min(moneySavedUp, requiredDeposit - actualLmiCoverage);
                const lmiContribution = actualLmiCoverage; // LMI covers y% of property price
                
                // Calculate how much savings we can use (maximize savings usage)
                // Priority: 1) Deposit, 2) LMI Cost (must come from savings), 3) Stamp Duty, 4) Additional Charges
                const savingsForDeposit = depositFromSavings;
                const savingsForLMI = Math.min(moneySavedUp - savingsForDeposit, actualLmiCost); // LMI cost must come from savings
                const savingsForStampDuty = Math.min(moneySavedUp - savingsForDeposit - savingsForLMI, stampDuty);
                const savingsForCharges = Math.min(moneySavedUp - savingsForDeposit - savingsForLMI - savingsForStampDuty, additionalCharges);
                
                // Use any remaining savings to reduce property borrowing (maximize savings usage)
                const savingsUsedForSpecificItems = savingsForDeposit + savingsForLMI + savingsForStampDuty + savingsForCharges;
                const remainingSavingsForProperty = Math.max(0, moneySavedUp - savingsUsedForSpecificItems);
                
                const totalSavingsUsed = moneySavedUp; // Use ALL savings
                const remainingSavings = 0; // No remaining savings - all used
                
                // Calculate borrowed money breakdown - use remaining savings to reduce property borrowing
                const borrowedForProperty = Math.max(0, propertyPrice - savingsForDeposit - remainingSavingsForProperty - lmiContribution);
                const borrowedForStampDuty = Math.max(0, stampDuty - savingsForStampDuty);
                const borrowedForCharges = Math.max(0, additionalCharges - savingsForCharges);
                const borrowedForLMI = 0; // LMI cost should always come from savings, never borrowed
                const totalBorrowed = borrowedForProperty + borrowedForStampDuty + borrowedForCharges + borrowedForLMI;
                const unusedBorrowingCapacity = Math.max(0, borrowingCapacity - totalBorrowed);
                
                // Calculate monthly repayment
                const monthlyRepayment = this.calculateMonthlyRepayment(totalBorrowed, interestRate, repaymentPeriod, repaymentType);
                
                bestResult = {
                    maxPropertyPrice: propertyPrice,
                    requiredDeposit: requiredDeposit,
                    lmiAmount: actualLmiCost, // This is the LMI insurance premium cost
                    lmiCoverage: actualLmiCoverage, // This is what LMI covers
                    stampDuty: stampDuty,
                    additionalCharges: additionalCharges,
                    moneyUsed: totalSavingsUsed,
                    totalPropertyCost: totalCost,
                    exemptions: stampDutyResult.exemptions,
                    // Savings breakdown
                    savingsForDeposit: savingsForDeposit,
                    savingsForLMI: savingsForLMI,
                    savingsForStampDuty: savingsForStampDuty,
                    savingsForCharges: savingsForCharges,
                    totalSavingsUsed: totalSavingsUsed,
                    remainingSavings: remainingSavings,
                    // Deposit breakdown
                    depositFromSavings: savingsForDeposit, // Only the actual deposit portion from savings
                    lmiContribution: lmiContribution,
                    // Additional savings used for property
                    remainingSavingsForProperty: remainingSavingsForProperty,
                    // Borrowing breakdown
                    borrowedForProperty: borrowedForProperty,
                    borrowedForStampDuty: borrowedForStampDuty,
                    borrowedForCharges: borrowedForCharges,
                    borrowedForLMI: borrowedForLMI,
                    totalBorrowed: totalBorrowed,
                    unusedBorrowingCapacity: unusedBorrowingCapacity,
                    monthlyRepayment: monthlyRepayment
                };
                low = propertyPrice + 1;
            } else {
                high = propertyPrice - 1;
            }
            
            if (high - low < 1000) {
                break;
            }
        }
        
        return bestResult || {
            maxPropertyPrice: 0,
            requiredDeposit: 0,
            lmiAmount: 0,
            lmiCoverage: 0,
            stampDuty: 0,
            additionalCharges: 0,
            moneyUsed: 0,
            totalPropertyCost: 0,
            exemptions: [],
            savingsForDeposit: 0,
            savingsForLMI: 0,
            savingsForStampDuty: 0,
            savingsForCharges: 0,
            totalSavingsUsed: 0,
            remainingSavings: 0,
            depositFromSavings: 0,
            lmiContribution: 0,
            borrowedForProperty: 0,
            borrowedForStampDuty: 0,
            borrowedForCharges: 0,
            borrowedForLMI: 0,
            totalBorrowed: 0,
            unusedBorrowingCapacity: 0,
            monthlyRepayment: 0
        };
    }

    calculateStampDuty(propertyPrice, state, buyerType) {
        switch (state) {
            case 'NSW':
                return this.calculateNSWStampDuty(propertyPrice, buyerType);
            case 'VIC':
                return this.calculateVICStampDuty(propertyPrice, buyerType);
            case 'QLD':
                return this.calculateQLDStampDuty(propertyPrice, buyerType);
            case 'WA':
                return this.calculateWAStampDuty(propertyPrice, buyerType);
            case 'SA':
                return this.calculateSAStampDuty(propertyPrice, buyerType);
            case 'TAS':
                return this.calculateTASStampDuty(propertyPrice, buyerType);
            case 'ACT':
                return this.calculateACTStampDuty(propertyPrice, buyerType);
            case 'NT':
                return this.calculateNTStampDuty(propertyPrice, buyerType);
            default:
                return { stampDuty: 0, exemptions: [], additionalCharges: 0 };
        }
    }

    calculateNSWStampDuty(propertyPrice, buyerType) {
        let stampDuty = 0;
        let exemptions = [];
        let additionalCharges = 0;

        // NSW Stamp Duty Rates (2024)
        if (propertyPrice <= 14000) {
            stampDuty = propertyPrice * 0.0125;
        } else if (propertyPrice <= 32000) {
            stampDuty = 175 + (propertyPrice - 14000) * 0.015;
        } else if (propertyPrice <= 85000) {
            stampDuty = 445 + (propertyPrice - 32000) * 0.0175;
        } else if (propertyPrice <= 319000) {
            stampDuty = 1372.50 + (propertyPrice - 85000) * 0.035;
        } else if (propertyPrice <= 1064000) {
            stampDuty = 9562.50 + (propertyPrice - 319000) * 0.045;
        } else {
            stampDuty = 43087.50 + (propertyPrice - 1064000) * 0.055;
        }

        // First Home Buyer Exemptions/Concessions
        if (buyerType === 'first-home') {
            if (propertyPrice <= 650000) {
                stampDuty = 0;
                exemptions.push('Full first home buyer exemption (≤ $650,000)');
            } else if (propertyPrice <= 800000) {
                const concession = this.calculateNSWFirstHomeConcession(propertyPrice);
                stampDuty = Math.max(0, stampDuty - concession);
                exemptions.push('First home buyer concession applied ($650,001 - $800,000)');
            }
        }

        // Foreign Buyer Duty (additional)
        if (buyerType === 'foreign') {
            additionalCharges = propertyPrice * 0.08; // 8% foreign buyer duty
        }

        return { stampDuty: Math.round(stampDuty), exemptions, additionalCharges: Math.round(additionalCharges) };
    }

    calculateNSWFirstHomeConcession(propertyPrice) {
        const maxConcession = 25000;
        const concessionRate = maxConcession / 150000;
        const excessAmount = propertyPrice - 650000;
        return Math.max(0, maxConcession - (excessAmount * concessionRate));
    }

    calculateWAStampDuty(propertyPrice, buyerType) {
        let stampDuty = 0;
        let exemptions = [];
        let additionalCharges = 0;

        // WA Stamp Duty Rates (2024)
        if (propertyPrice <= 120000) {
            stampDuty = propertyPrice * 0.0015;
        } else if (propertyPrice <= 150000) {
            stampDuty = 180 + (propertyPrice - 120000) * 0.0025;
        } else if (propertyPrice <= 360000) {
            stampDuty = 255 + (propertyPrice - 150000) * 0.04;
        } else if (propertyPrice <= 725000) {
            stampDuty = 8655 + (propertyPrice - 360000) * 0.05;
        } else {
            stampDuty = 26905 + (propertyPrice - 725000) * 0.06;
        }

        // First Home Owner Exemptions
        if (buyerType === 'first-home') {
            if (propertyPrice <= 430000) {
                stampDuty = 0;
                exemptions.push('Full first home buyer exemption (≤ $430,000)');
            } else if (propertyPrice <= 530000) {
                const concessionAmount = this.calculateWAFirstHomeConcession(propertyPrice);
                stampDuty = Math.max(0, stampDuty - concessionAmount);
                exemptions.push('First home buyer concession applied ($430,001 - $530,000)');
            }
        }

        // Foreign Buyer Duty (additional)
        if (buyerType === 'foreign') {
            additionalCharges = propertyPrice * 0.07; // 7% foreign buyer duty
        }

        return { stampDuty: Math.round(stampDuty), exemptions, additionalCharges: Math.round(additionalCharges) };
    }

    calculateWAFirstHomeConcession(propertyPrice) {
        const maxProperty = 530000;
        const minProperty = 430000;
        const range = maxProperty - minProperty;
        const propertyInRange = propertyPrice - minProperty;
        const concessionRate = propertyInRange / range;
        
        const fullStampDuty = 8655 + (propertyPrice - 360000) * 0.05;
        return fullStampDuty * (1 - concessionRate);
    }

    calculateVICStampDuty(propertyPrice, buyerType) {
        let stampDuty = 0;
        let exemptions = [];
        let additionalCharges = 0;

        // Victoria Stamp Duty Rates (2024)
        if (propertyPrice <= 25000) {
            stampDuty = propertyPrice * 0.014;
        } else if (propertyPrice <= 130000) {
            stampDuty = 350 + (propertyPrice - 25000) * 0.024;
        } else if (propertyPrice <= 960000) {
            stampDuty = 2870 + (propertyPrice - 130000) * 0.055;
        } else {
            stampDuty = 48520 + (propertyPrice - 960000) * 0.065;
        }

        // First Home Buyer Exemptions
        if (buyerType === 'first-home') {
            if (propertyPrice <= 600000) {
                stampDuty = 0;
                exemptions.push('Full first home buyer exemption (≤ $600,000)');
            } else if (propertyPrice <= 750000) {
                const concession = this.calculateVICFirstHomeConcession(propertyPrice);
                stampDuty = Math.max(0, stampDuty - concession);
                exemptions.push('First home buyer concession applied ($600,001 - $750,000)');
            }
        }

        // Foreign Buyer Duty (additional)
        if (buyerType === 'foreign') {
            additionalCharges = propertyPrice * 0.08; // 8% foreign buyer duty
        }

        return { stampDuty: Math.round(stampDuty), exemptions, additionalCharges: Math.round(additionalCharges) };
    }

    calculateVICFirstHomeConcession(propertyPrice) {
        // Sliding scale concession for properties between $600,001 - $750,000
        const baseStampDuty = 2870 + (propertyPrice - 130000) * 0.055;
        const concessionRate = (750000 - propertyPrice) / 150000;
        return baseStampDuty * concessionRate;
    }

    calculateQLDStampDuty(propertyPrice, buyerType) {
        let stampDuty = 0;
        let exemptions = [];
        let additionalCharges = 0;

        // Queensland Stamp Duty Rates (2024)
        if (propertyPrice <= 5000) {
            stampDuty = 0;
        } else if (propertyPrice <= 75000) {
            stampDuty = (propertyPrice - 5000) * 0.015;
        } else if (propertyPrice <= 540000) {
            stampDuty = 1050 + (propertyPrice - 75000) * 0.035;
        } else if (propertyPrice <= 1000000) {
            stampDuty = 17325 + (propertyPrice - 540000) * 0.045;
        } else {
            stampDuty = 38025 + (propertyPrice - 1000000) * 0.0575;
        }

        // First Home Buyer Exemptions
        if (buyerType === 'first-home') {
            if (propertyPrice <= 550000) {
                stampDuty = 0;
                exemptions.push('Full first home buyer exemption (≤ $550,000)');
            }
        }

        // Foreign Buyer Duty (additional)
        if (buyerType === 'foreign') {
            additionalCharges = propertyPrice * 0.08; // 8% foreign buyer duty
        }

        return { stampDuty: Math.round(stampDuty), exemptions, additionalCharges: Math.round(additionalCharges) };
    }

    calculateSAStampDuty(propertyPrice, buyerType) {
        let stampDuty = 0;
        let exemptions = [];
        let additionalCharges = 0;

        // South Australia Stamp Duty Rates (2024)
        if (propertyPrice <= 12000) {
            stampDuty = propertyPrice * 0.01;
        } else if (propertyPrice <= 30000) {
            stampDuty = 120 + (propertyPrice - 12000) * 0.02;
        } else if (propertyPrice <= 50000) {
            stampDuty = 480 + (propertyPrice - 30000) * 0.03;
        } else if (propertyPrice <= 100000) {
            stampDuty = 1080 + (propertyPrice - 50000) * 0.035;
        } else if (propertyPrice <= 200000) {
            stampDuty = 2830 + (propertyPrice - 100000) * 0.04;
        } else if (propertyPrice <= 250000) {
            stampDuty = 6830 + (propertyPrice - 200000) * 0.045;
        } else if (propertyPrice <= 300000) {
            stampDuty = 9080 + (propertyPrice - 250000) * 0.05;
        } else if (propertyPrice <= 500000) {
            stampDuty = 11580 + (propertyPrice - 300000) * 0.055;
        } else {
            stampDuty = 22580 + (propertyPrice - 500000) * 0.06;
        }

        // First Home Buyer Exemptions
        if (buyerType === 'first-home') {
            if (propertyPrice <= 650000) {
                stampDuty = 0;
                exemptions.push('Full first home buyer exemption (≤ $650,000)');
            }
        }

        // Foreign Buyer Duty (additional)
        if (buyerType === 'foreign') {
            additionalCharges = propertyPrice * 0.07; // 7% foreign buyer duty
        }

        return { stampDuty: Math.round(stampDuty), exemptions, additionalCharges: Math.round(additionalCharges) };
    }

    calculateTASStampDuty(propertyPrice, buyerType) {
        let stampDuty = 0;
        let exemptions = [];
        let additionalCharges = 0;

        // Tasmania Stamp Duty Rates (2024)
        if (propertyPrice <= 3000) {
            stampDuty = propertyPrice * 0.01;
        } else if (propertyPrice <= 25000) {
            stampDuty = 30 + (propertyPrice - 3000) * 0.015;
        } else if (propertyPrice <= 75000) {
            stampDuty = 360 + (propertyPrice - 25000) * 0.025;
        } else if (propertyPrice <= 200000) {
            stampDuty = 1610 + (propertyPrice - 75000) * 0.035;
        } else if (propertyPrice <= 375000) {
            stampDuty = 5985 + (propertyPrice - 200000) * 0.04;
        } else if (propertyPrice <= 725000) {
            stampDuty = 12985 + (propertyPrice - 375000) * 0.045;
        } else {
            stampDuty = 28735 + (propertyPrice - 725000) * 0.05;
        }

        // First Home Buyer Exemptions
        if (buyerType === 'first-home') {
            if (propertyPrice <= 600000) {
                stampDuty = 0;
                exemptions.push('Full first home buyer exemption (≤ $600,000)');
            }
        }

        // Foreign Buyer Duty (additional)
        if (buyerType === 'foreign') {
            additionalCharges = propertyPrice * 0.08; // 8% foreign buyer duty
        }

        return { stampDuty: Math.round(stampDuty), exemptions, additionalCharges: Math.round(additionalCharges) };
    }

    calculateACTStampDuty(propertyPrice, buyerType) {
        let stampDuty = 0;
        let exemptions = [];
        let additionalCharges = 0;

        // ACT Stamp Duty Rates (2024) - Being phased out, minimal rates
        if (propertyPrice <= 200000) {
            stampDuty = 0;
        } else if (propertyPrice <= 300000) {
            stampDuty = (propertyPrice - 200000) * 0.012;
        } else if (propertyPrice <= 500000) {
            stampDuty = 1200 + (propertyPrice - 300000) * 0.016;
        } else if (propertyPrice <= 750000) {
            stampDuty = 4400 + (propertyPrice - 500000) * 0.02;
        } else if (propertyPrice <= 1000000) {
            stampDuty = 9400 + (propertyPrice - 750000) * 0.024;
        } else {
            stampDuty = 15400 + (propertyPrice - 1000000) * 0.0475;
        }

        // First Home Buyer Exemptions
        if (buyerType === 'first-home') {
            stampDuty = 0;
            exemptions.push('First home buyer exemption - no stamp duty');
        }

        // Foreign Buyer Duty (additional)
        if (buyerType === 'foreign') {
            additionalCharges = propertyPrice * 0.125; // 12.5% foreign buyer duty
        }

        return { stampDuty: Math.round(stampDuty), exemptions, additionalCharges: Math.round(additionalCharges) };
    }

    calculateNTStampDuty(propertyPrice, buyerType) {
        let stampDuty = 0;
        let exemptions = [];
        let additionalCharges = 0;

        // Northern Territory Stamp Duty Rates (2024)
        if (propertyPrice <= 25000) {
            stampDuty = propertyPrice * 0.06 / 100; // 0.06%
        } else if (propertyPrice <= 3000000) {
            stampDuty = 15 + (propertyPrice - 25000) * 0.0515 / 100; // 0.0515%
        } else {
            stampDuty = 1546.125 + (propertyPrice - 3000000) * 0.0575 / 100; // 0.0575%
        }

        // First Home Buyer Exemptions
        if (buyerType === 'first-home') {
            if (propertyPrice <= 650000) {
                stampDuty = 0;
                exemptions.push('Full first home buyer exemption (≤ $650,000)');
            }
        }

        // Foreign Buyer Duty (additional)
        if (buyerType === 'foreign') {
            additionalCharges = propertyPrice * 0.055; // 5.5% foreign buyer duty
        }

        return { stampDuty: Math.round(stampDuty), exemptions, additionalCharges: Math.round(additionalCharges) };
    }

    calculateLMIPremium(loanAmount, lvr, buyerType) {
        // LMI is only required when LVR > 80%
        if (lvr <= 80) {
            return 0;
        }

        // LMI premium rates based on LVR bands (as % of loan amount)
        // These are typical rates - actual rates vary by lender and LMI provider
        let premiumRate = 0;

        if (buyerType === 'investor') {
            // Higher rates for investment properties
            if (lvr <= 85) {
                premiumRate = 0.0089; // 0.89%
            } else if (lvr <= 90) {
                premiumRate = 0.0178; // 1.78%
            } else if (lvr <= 95) {
                premiumRate = 0.0267; // 2.67%
            } else {
                premiumRate = 0.0356; // 3.56%
            }
        } else {
            // Owner-occupier and first home buyer rates
            if (lvr <= 85) {
                premiumRate = 0.0062; // 0.62%
            } else if (lvr <= 90) {
                premiumRate = 0.0124; // 1.24%
            } else if (lvr <= 95) {
                premiumRate = 0.0186; // 1.86%
            } else {
                premiumRate = 0.0248; // 2.48%
            }
        }

        // Calculate premium based on loan amount
        const premium = loanAmount * premiumRate;
        
        // Apply minimum premium (typically around $1,500-$2,000)
        const minimumPremium = 1500;
        
        return Math.round(Math.max(premium, minimumPremium));
    }

    calculateMonthlyRepayment(loanAmount, annualInterestRate, loanTermYears, repaymentType = 'principal-interest') {
        if (loanAmount === 0) {
            return 0;
        }
        
        const monthlyInterestRate = annualInterestRate / 100 / 12;
        const numberOfPayments = loanTermYears * 12;
        
        if (repaymentType === 'interest-only') {
            // Interest-only payments: just pay the monthly interest
            const monthlyPayment = loanAmount * monthlyInterestRate;
            return Math.round(monthlyPayment);
        }
        
        // Principal + Interest payments (default)
        if (monthlyInterestRate === 0) {
            // No interest case
            return loanAmount / numberOfPayments;
        }
        
        // Standard mortgage payment formula: M = P [ r(1 + r)^n ] / [ (1 + r)^n – 1]
        const monthlyPayment = loanAmount * 
            (monthlyInterestRate * Math.pow(1 + monthlyInterestRate, numberOfPayments)) /
            (Math.pow(1 + monthlyInterestRate, numberOfPayments) - 1);
        
        return Math.round(monthlyPayment);
    }

    calculateEquityBuildup(propertyPrice, loanAmount, interestRate, repaymentPeriod, monthlyPayment, propertyAppreciationRate, repaymentType = 'principal-interest') {
        const equityData = [];
        const monthlyInterestRate = interestRate / 100 / 12;
        const propertyAppreciationRateDecimal = propertyAppreciationRate / 100; // Convert percentage to decimal
        let remainingBalance = loanAmount;
        let totalPrincipalPaid = 0;
        
        for (let year = 0; year <= Math.min(10, repaymentPeriod); year++) {
            const currentPropertyValue = propertyPrice * Math.pow(1 + propertyAppreciationRateDecimal, year);
            const equity = currentPropertyValue - remainingBalance;
            const totalAppreciation = currentPropertyValue - propertyPrice;
            
            equityData.push({
                year: year,
                loanBalance: Math.round(remainingBalance),
                equity: Math.round(equity),
                propertyValue: Math.round(currentPropertyValue),
                principalPaid: Math.round(totalPrincipalPaid),
                appreciation: Math.round(totalAppreciation)
            });
            
            // Calculate loan balance for next year (12 monthly payments)
            if (year < repaymentPeriod) {
                let yearlyPrincipalPaid = 0;
                
                if (repaymentType === 'interest-only') {
                    // For interest-only loans, no principal is paid, so balance remains the same
                    yearlyPrincipalPaid = 0;
                    // remainingBalance stays the same
                } else {
                    // For principal+interest loans, calculate principal payments
                    for (let month = 0; month < 12; month++) {
                        const interestPayment = remainingBalance * monthlyInterestRate;
                        const principalPayment = monthlyPayment - interestPayment;
                        remainingBalance = Math.max(0, remainingBalance - principalPayment);
                        yearlyPrincipalPaid += principalPayment;
                        
                        if (remainingBalance <= 0) break;
                    }
                }
                
                totalPrincipalPaid += yearlyPrincipalPaid;
            }
        }
        
        return equityData;
    }

    displayEquityTable(equityData) {
        const tableBody = document.getElementById('equityTableBody');
        tableBody.innerHTML = '';
        
        equityData.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.year}</td>
                <td>$${row.propertyValue.toLocaleString()}</td>
                <td>$${row.loanBalance.toLocaleString()}</td>
                <td>$${row.principalPaid.toLocaleString()}</td>
                <td>$${row.appreciation.toLocaleString()}</td>
                <td>$${row.equity.toLocaleString()}</td>
            `;
            tableBody.appendChild(tr);
        });
        
        document.getElementById('equity-buildup').style.display = 'block';
    }

    displayResults(data) {
        const stateNames = {
            'NSW': 'New South Wales',
            'WA': 'Western Australia'
        };

        const buyerTypeNames = {
            'first-home': 'First Home Buyer',
            'owner-occupier': 'Owner Occupier',
            'investor': 'Investor',
            'foreign': 'Foreign Buyer'
        };

        // Update main results
        document.getElementById('maxPropertyPrice').textContent = `$${data.maxPropertyPrice.toLocaleString()}`;
        
        // Calculate LMI deposit percentage: (LMI Contribution * 100 / Property Price)
        const lmiDepositPercentage = data.maxPropertyPrice > 0 ? (data.lmiContribution * 100 / data.maxPropertyPrice) : 0;
        document.getElementById('lmiDepositPercentage').textContent = `${lmiDepositPercentage.toFixed(2)}%`;
        
        document.getElementById('requiredDeposit').textContent = `$${data.requiredDeposit.toLocaleString()}`;
        document.getElementById('lmiAmount').textContent = `$${data.lmiAmount.toLocaleString()}`;
        document.getElementById('stampDutyAmount').textContent = `$${data.stampDuty.toLocaleString()}`;
        document.getElementById('totalPropertyCost').textContent = `$${data.totalPropertyCost.toLocaleString()}`;

        // Update savings breakdown section
        document.getElementById('savingsForDeposit').textContent = `$${data.savingsForDeposit.toLocaleString()}`;
        document.getElementById('savingsForLMI').textContent = `$${data.savingsForLMI.toLocaleString()}`;
        document.getElementById('savingsForStampDuty').textContent = `$${data.savingsForStampDuty.toLocaleString()}`;
        document.getElementById('savingsForCharges').textContent = `$${data.savingsForCharges.toLocaleString()}`;
        document.getElementById('totalSavingsUsed').textContent = `$${data.totalSavingsUsed.toLocaleString()}`;
        document.getElementById('remainingSavings').textContent = `$${data.remainingSavings.toLocaleString()}`;

        // Update property funding breakdown section
        document.getElementById('depositFromSavings').textContent = `$${data.depositFromSavings.toLocaleString()}`;
        document.getElementById('additionalSavingsForProperty').textContent = `$${data.remainingSavingsForProperty.toLocaleString()}`;
        document.getElementById('lmiContribution').textContent = `$${data.lmiContribution.toLocaleString()}`;
        document.getElementById('borrowedForPropertyBreakdown').textContent = `$${data.borrowedForProperty.toLocaleString()}`;
        document.getElementById('totalPropertyPriceBreakdown').textContent = `$${data.maxPropertyPrice.toLocaleString()}`;

        // Update monthly repayments section
        document.getElementById('monthlyRepayment').textContent = `$${data.monthlyRepayment.toLocaleString()}`;

        // Update right-side borrowing breakdown section
        // Property Purchase = borrowed amount for property (not full property price)
        document.getElementById('borrowedForPropertyRight').textContent = `$${data.borrowedForProperty.toLocaleString()}`;
        // LMI Contribution = the amount LMI covers
        document.getElementById('borrowedLMIContribution').textContent = `$${data.lmiContribution.toLocaleString()}`;
        document.getElementById('borrowedForStampDutyRight').textContent = `$${data.borrowedForStampDuty.toLocaleString()}`;
        document.getElementById('borrowedForChargesRight').textContent = `$${data.borrowedForCharges.toLocaleString()}`;
        document.getElementById('borrowedForLMIRight').textContent = `$${data.borrowedForLMI.toLocaleString()}`;
        
        // Total Borrowed should only include property-related borrowing (Property Purchase + LMI Contribution)
        // This way: Total Borrowed + For Deposit = Maximum Property Price
        const totalBorrowedForProperty = data.borrowedForProperty + data.lmiContribution;
        document.getElementById('totalBorrowedRight').textContent = `$${totalBorrowedForProperty.toLocaleString()}`;
        
        // Unused borrowing capacity should be based on all borrowing (including costs)
        const totalActualBorrowing = data.totalBorrowed + data.lmiContribution;
        const unusedBorrowingCapacity = data.borrowingCapacity - totalActualBorrowing;
        document.getElementById('unusedBorrowingCapacity').textContent = `$${unusedBorrowingCapacity.toLocaleString()}`;

        // Calculate and display equity buildup
        // Loan balance should only include mortgage against the property (borrowed for property + LMI contribution)
        // Not borrowing for stamp duty, charges, or LMI costs
        const propertyMortgageBalance = data.borrowedForProperty + data.lmiContribution;
        const equityData = this.calculateEquityBuildup(
            data.maxPropertyPrice,
            propertyMortgageBalance,
            data.interestRate,
            data.repaymentPeriod,
            data.monthlyRepayment,
            data.propertyAppreciation,
            data.repaymentType
        );
        this.displayEquityTable(equityData);

        // Show exemptions if any
        const exemptionInfo = document.getElementById('exemptionInfo');
        const exemptionList = document.getElementById('exemptionList');
        
        if (data.exemptions.length > 0 || data.additionalCharges > 0) {
            exemptionList.innerHTML = '';
            data.exemptions.forEach(exemption => {
                const li = document.createElement('li');
                li.textContent = exemption;
                exemptionList.appendChild(li);
            });
            
            if (data.additionalCharges > 0) {
                const li = document.createElement('li');
                li.textContent = `Foreign buyer duty: $${data.additionalCharges.toLocaleString()}`;
                exemptionList.appendChild(li);
            }
            
            exemptionInfo.style.display = 'block';
        } else {
            exemptionInfo.style.display = 'none';
        }

        // Show results and hide placeholder
        this.placeholder.style.display = 'none';
        this.results.style.display = 'block';
        
        // Show right-column sections
        document.getElementById('monthly-repayments').style.display = 'block';
        document.getElementById('borrowing-breakdown-right').style.display = 'block';
        document.getElementById('deposit-breakdown-right').style.display = 'block';
    }
}

// Initialize the calculator when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const calculator = new AffordabilityCalculator();
    // Auto-calculate on page load with default values
    calculator.calculateAffordability();
});

// Add some helper functions for better UX
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: 'AUD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}