import React, { useState } from 'react';
import { getWeb3, verifyDomainOwnership, requestAccountAccess } from '../utils/web3Utils';

interface VerifyOwnershipComponentProps {
    onVerificationSuccess: (verified: boolean) => void;
}

const VerifyOwnershipComponent: React.FC<VerifyOwnershipComponentProps> = ({ onVerificationSuccess }) => {
    const [subdomain, setSubdomain] = useState('');
    const [verificationResult, setVerificationResult] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleVerifyClick = async () => {
        try {
            setIsLoading(true);
            const web3 = getWeb3();
            await requestAccountAccess(web3);
            const result = await verifyDomainOwnership(web3, `${subdomain}.agi.eth`);
            setVerificationResult(result ? 
                `Magnificent! The domain '${subdomain}.agi.eth' is indeed yours.` : 
                `Regrettably, '${subdomain}.agi.eth' does not appear to be associated with your account.`);
            onVerificationSuccess(result);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
            setVerificationResult(`Error: ${errorMessage}`);
            onVerificationSuccess(false);
        } finally {
            setIsLoading(false);
        }
    };

    const renderVerificationResult = () => {
        if (!verificationResult) return null;

        const isSuccess = verificationResult.startsWith('Magnificent');
        const resultClass = isSuccess ? 'result-success' : 'result-failure';

        return <p className={`result ${resultClass}`}>{verificationResult}</p>;
    };

    return (
        <div className="verify-ownership-container">
            <h2>Confirm Your AGI.Eth Domain</h2>
            <p className="instructions">
                Kindly enter the name of your distinguished AGI.Eth domain (e.g., &apos;mary&apos; for &apos;mary.agi.eth&apos;) and select &quot;Verify&quot; to confirm its ownership.
            </p>
            <div className="input-group">
                <input 
                    type="text" 
                    value={subdomain} 
                    onChange={(e) => setSubdomain(e.target.value)} 
                    placeholder="e.g., mary"
                    disabled={isLoading}
                    className="input-field"
                />
                <button 
                    onClick={handleVerifyClick} 
                    disabled={isLoading}
                    className={`verify-button ${isLoading ? 'loading' : ''}`}
                >
                    {isLoading ? 'Verifying...' : 'Verify'}
                </button>
            </div>
            {renderVerificationResult()}
            <style jsx>{`
                .verify-ownership-container {
                    max-width: 700px;
                    margin: 60px auto;
                    text-align: center;
                    font-family: 'Georgia', serif;
                    background: #fff;
                    padding: 50px;
                    border-radius: 15px;
                    box-shadow: 0 8px 20px rgba(0,0,0,0.12);
                }

                h2 {
                    color: #333;
                    font-size: 28px;
                    margin-bottom: 20px;
                }

                .instructions {
                    font-size: 18px;
                    color: #555;
                    margin-bottom: 25px;
                }

                .input-group {
                    display: flex;
                    justify-content: center;
                    gap: 15px;
                    margin-bottom: 30px;
                }

                .input-field {
                    flex: 1;
                    padding: 15px;
                    border-radius: 5px;
                    border: 2px solid #EAECEE;
                    font-size: 18px;
                    color: #555;
                }

                .verify-button {
                    background-color: #2980B9;
                    color: white;
                    padding: 15px 30px;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 18px;
                    font-weight: bold;
                    transition: background-color 0.3s;
                }

                .verify-button:hover {
                    background-color: #21618C;
                }

                .verify-button.loading {
                    background-color: #D0D3D4;
                    cursor: not-allowed;
                }

                .result {
                    margin-top: 30px;
                    padding: 20px;
                    border-radius: 5px;
                    color: #fff;
                    font-weight: bold;
                    font-size: 20px;
                    width: 80%;
                    margin-left: auto;
                    margin-right: auto;
                }

                .result-success {
                    background-color: #27AE60;
                }

                .result-failure {
                    background-color: #C0392B;
                }
            `}</style>
        </div>
    );
};

export default VerifyOwnershipComponent;

