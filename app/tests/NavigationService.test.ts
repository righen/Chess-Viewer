import { NavigationService, type NavigationCommand, type NavigationObserver } from '../services/NavigationService';

describe('NavigationService', () => {
    let navigationService: NavigationService;
    let mockObserver: NavigationObserver;
    let mockCommandFn: jest.Mock;

    beforeEach(() => {
        // Reset the singleton instance before each test
        // @ts-ignore - accessing private property for testing
        NavigationService.instance = undefined;
        navigationService = NavigationService.getInstance();
        
        // Create a mock observer with properly typed mock function
        mockCommandFn = jest.fn();
        mockObserver = {
            onNavigationCommand: mockCommandFn
        };
    });

    afterEach(() => {
        // Clean up after each test
        navigationService.cleanup();
    });

    describe('Observer Pattern', () => {
        it('should add and remove observers correctly', () => {
            navigationService.addObserver(mockObserver);
            
            // Simulate a keyboard event
            const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
            window.dispatchEvent(event);
            
            expect(mockCommandFn).toHaveBeenCalledWith('prev');
            
            navigationService.removeObserver(mockObserver);
            
            // After removal, observer should not be called
            mockCommandFn.mockClear();
            window.dispatchEvent(event);
            expect(mockCommandFn).not.toHaveBeenCalled();
        });
    });

    describe('Keyboard Shortcuts', () => {
        beforeEach(() => {
            navigationService.addObserver(mockObserver);
        });

        it('should handle ArrowLeft for previous move', () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
            expect(mockCommandFn).toHaveBeenCalledWith('prev');
        });

        it('should handle ArrowRight for next move', () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
            expect(mockCommandFn).toHaveBeenCalledWith('next');
        });

        it('should handle Home for first move', () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
            expect(mockCommandFn).toHaveBeenCalledWith('first');
        });

        it('should handle End for last move', () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
            expect(mockCommandFn).toHaveBeenCalledWith('last');
        });

        it('should handle f key for board flip', () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
            expect(mockCommandFn).toHaveBeenCalledWith('flip');
        });
    });

    describe('Service Controls', () => {
        beforeEach(() => {
            navigationService.addObserver(mockObserver);
        });

        it('should enable and disable navigation', () => {
            // Service starts enabled by default
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
            expect(mockCommandFn).toHaveBeenCalledWith('prev');

            // Disable navigation
            navigationService.setEnabled(false);
            mockCommandFn.mockClear();
            
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
            expect(mockCommandFn).not.toHaveBeenCalled();

            // Re-enable navigation
            navigationService.setEnabled(true);
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
            expect(mockCommandFn).toHaveBeenCalledWith('prev');
        });

        it('should add and remove custom shortcuts', () => {
            // Add a custom shortcut
            navigationService.addShortcut({
                key: 'r',
                command: 'first'
            });

            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
            expect(mockCommandFn).toHaveBeenCalledWith('first');

            // Remove the custom shortcut
            navigationService.removeShortcut('r');
            mockCommandFn.mockClear();
            
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
            expect(mockCommandFn).not.toHaveBeenCalled();
        });

        it('should handle modifier key shortcuts', () => {
            navigationService.addShortcut({
                key: 'n',
                command: 'next',
                ctrlKey: true
            });

            // Without Ctrl key - should not trigger
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
            expect(mockCommandFn).not.toHaveBeenCalled();

            // With Ctrl key - should trigger
            window.dispatchEvent(new KeyboardEvent('keydown', { 
                key: 'n',
                ctrlKey: true
            }));
            expect(mockCommandFn).toHaveBeenCalledWith('next');
        });
    });

    describe('Singleton Pattern', () => {
        it('should maintain a single instance', () => {
            const instance1 = NavigationService.getInstance();
            const instance2 = NavigationService.getInstance();
            expect(instance1).toBe(instance2);
        });
    });
}); 